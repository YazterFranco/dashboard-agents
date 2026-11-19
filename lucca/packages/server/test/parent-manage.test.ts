import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { TaskSchema, type KidState, type Task } from '@lucca/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { LuccaDb } from '../src/db.js';

const WEDNESDAY = Date.parse('2026-11-18T17:00:00Z'); // miércoles 18, mediodía en Panamá
const SETUP = { pin: '482913', childName: 'Lucca', grade: 2, lang: 'es', theme: 'dark' } as const;
const NEW_TASK = { subject: 'science', title: 'Traer una hoja del jardín', assignedDate: '2026-11-19', dueDate: '2026-11-20' } as const;

describe('parent management', () => {
  let app: FastifyInstance;
  let db: LuccaDb;
  let clock = WEDNESDAY;
  let cookie = '';

  beforeEach(async () => {
    clock = WEDNESDAY;
    db = new LuccaDb(':memory:');
    app = await buildApp({ db, config: { ...loadConfig({}), aiConfigured: true }, now: () => new Date(clock) });
    const res = await app.inject({ method: 'POST', url: '/api/parent/setup', payload: SETUP });
    cookie = String(res.headers['set-cookie']).split(';')[0];
  });
  afterEach(async () => {
    await app.close();
    db.close();
  });

  const call = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown, withCookie = true) =>
    app.inject({ method, url, payload: payload as object | undefined, headers: withCookie ? { cookie } : {} });
  const overview = async () => (await call('GET', '/api/parent/overview')).json() as { today: string; weekStart: string; settings: Record<string, unknown>; tasks: Task[]; connections: unknown };
  const kid = async () => (await call('GET', '/api/kid/state', undefined, false)).json() as KidState;
  const create = async (body: object = NEW_TASK) => call('POST', '/api/parent/tasks', body);
  const mk = (p: Partial<Task> & { id: string }): Task => TaskSchema.parse({ subject: 'math', title: `Tarea ${p.id}`, source: 'manual', ...p });

  describe('positive', () => {
    it('the overview brings every task, including hidden and retired, the local day and the settings', async () => {
      db.upsertTask(mk({ id: 'a' }));
      db.upsertTask(mk({ id: 'b', hidden: true }));
      db.upsertTask(mk({ id: 'c', retired: true }));
      const o = await overview();
      expect(o.tasks.map((t) => t.id).sort()).toEqual(['a', 'b', 'c']);
      expect(o).toMatchObject({ today: '2026-11-18', weekStart: '2026-11-16', connections: { ai: true, mereb: false } });
      expect(o.settings).toMatchObject({ childName: 'Lucca', grade: 2, tz: 'America/Panama' });
    });

    it('creates a minimal manual task', async () => {
      const res = await create({ subject: 'math', title: 'Sumas' });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ source: 'manual', status: 'todo', title: 'Sumas', assignedDate: null, dueDate: null, hidden: false, retired: false });
      expect(res.json().id).toMatch(/^manual-/);
    });

    it('creates a full task and Lucca sees it, with its English title', async () => {
      const res = await create({ ...NEW_TASK, titleEn: 'Bring a leaf from the garden', description: 'Una hoja verde' });
      const task = res.json() as Task;
      expect(task.titleTranslations).toEqual({ en: 'Bring a leaf from the garden' });
      const seen = (await kid()).tasks.find((t) => t.id === task.id)!;
      expect(seen).toMatchObject({ title: 'Traer una hoja del jardín', assignedDate: '2026-11-19', dueDate: '2026-11-20', description: 'Una hoja verde' });
    });

    it('edits title, subject and dates', async () => {
      const id = ((await create()).json() as Task).id;
      const res = await call('PATCH', `/api/parent/tasks/${id}`, { title: 'Hoja y flor', subject: 'art', assignedDate: '2026-11-19', dueDate: '2026-11-23' });
      expect(res.statusCode).toBe(200);
      expect(db.getTask(id)).toMatchObject({ title: 'Hoja y flor', subject: 'art', dueDate: '2026-11-23' });
    });

    it('moves a task to another day', async () => {
      const id = ((await create()).json() as Task).id;
      await call('PATCH', `/api/parent/tasks/${id}`, { assignedDate: '2026-11-20', dueDate: '2026-11-21' });
      expect(db.getTask(id)).toMatchObject({ assignedDate: '2026-11-20', dueDate: '2026-11-21' });
    });

    it('hides a task from Lucca but not from the parent, and shows it again', async () => {
      const id = ((await create()).json() as Task).id;
      await call('PATCH', `/api/parent/tasks/${id}`, { hidden: true });
      expect((await kid()).tasks.some((t) => t.id === id)).toBe(false);
      expect((await overview()).tasks.find((t) => t.id === id)).toMatchObject({ hidden: true });
      await call('PATCH', `/api/parent/tasks/${id}`, { hidden: false });
      expect((await kid()).tasks.some((t) => t.id === id)).toBe(true);
    });

    it('marks a task done for Lucca without giving a star, and can undo it', async () => {
      const id = ((await create()).json() as Task).id;
      await call('PATCH', `/api/parent/tasks/${id}`, { status: 'done' });
      const done = await kid();
      expect(done.tasks.find((t) => t.id === id)!.status).toBe('done');
      expect(done.starsThisWeek).toBe(0);
      await call('PATCH', `/api/parent/tasks/${id}`, { status: 'todo' });
      expect((await kid()).tasks.find((t) => t.id === id)!.status).toBe('todo');
    });

    it('deletes a manual task for good', async () => {
      const id = ((await create()).json() as Task).id;
      const res = await call('DELETE', `/api/parent/tasks/${id}`);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ result: 'removed' });
      expect(db.getTask(id)).toBeNull();
    });

    it('retires a task that came from Mereb instead of deleting it', async () => {
      db.upsertTask(mk({ id: 'mereb-1', source: 'mereb' }));
      const res = await call('DELETE', '/api/parent/tasks/mereb-1');
      expect(res.json()).toEqual({ result: 'retired' });
      expect(db.getTask('mereb-1')).toMatchObject({ retired: true });
      expect((await kid()).tasks.some((t) => t.id === 'mereb-1')).toBe(false);
    });

    it('updates every setting and Lucca sees them', async () => {
      const res = await call('PUT', '/api/parent/settings', { childName: 'Lucía', grade: 3, lang: 'en', voiceMode: 'text', theme: 'light', speechRate: 1.1 });
      expect(res.statusCode).toBe(200);
      expect((await kid()).settings).toMatchObject({ childName: 'Lucía', grade: 3, lang: 'en', voiceMode: 'text', theme: 'light', speechRate: 1.1 });
    });

    it('summarises the progress of the weeks, newest first, with who needs help', async () => {
      db.upsertTask(mk({ id: 'a', title: 'Restas', assignedDate: '2026-11-17', status: 'done' }));
      db.upsertTask(mk({ id: 'b', title: 'Lectura', assignedDate: '2026-11-18' }));
      const ev = (id: string, taskId: string, kind: 'task_done' | 'hint_used' | 'help_requested', at: string) => db.addProgress({ id, taskId, kind, at });
      ev('1', 'a', 'task_done', '2026-11-17T15:00:00Z');
      ev('2', 'b', 'hint_used', '2026-11-18T15:00:00Z');
      ev('3', 'b', 'help_requested', '2026-11-18T15:05:00Z');
      ev('4', 'b', 'help_requested', '2026-11-18T15:06:00Z');
      const body = (await call('GET', '/api/parent/progress?weeks=2')).json();
      expect(body.weeks).toHaveLength(2);
      expect(body.weeks[0]).toEqual({ weekStart: '2026-11-16', total: 2, done: 1, pending: 1, stars: 1, hints: 1, helpRequests: 2 });
      expect(body.weeks[1].weekStart).toBe('2026-11-09');
      expect(body.needsHelp).toEqual([{ weekStart: '2026-11-16', taskId: 'b', title: 'Lectura', count: 2 }]);
    });

    it('defaults to four weeks of progress', async () => {
      expect((await call('GET', '/api/parent/progress')).json().weeks).toHaveLength(4);
    });
  });

  describe('negative', () => {
    it.each([
      ['GET', '/api/parent/overview'],
      ['POST', '/api/parent/tasks'],
      ['PATCH', '/api/parent/tasks/x'],
      ['DELETE', '/api/parent/tasks/x'],
      ['PUT', '/api/parent/settings'],
      ['GET', '/api/parent/progress'],
    ] as const)('%s %s without a session is a 401 with no data', async (method, url) => {
      const res = await call(method, url, {}, false);
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: 'Hace falta el PIN' });
    });

    it.each([
      ['no title', { subject: 'math' }, 'title'],
      ['a title of spaces', { subject: 'math', title: '   ' }, 'title'],
      ['a title of 201 characters', { subject: 'math', title: 'a'.repeat(201) }, 'title'],
      ['no subject', { title: 'Sumas' }, 'subject'],
      ['an unknown subject', { subject: 'química', title: 'Sumas' }, 'subject'],
      ['an impossible assigned date', { subject: 'math', title: 'x', assignedDate: '2026-02-30' }, 'assignedDate'],
      ['a wrongly written due date', { subject: 'math', title: 'x', dueDate: '19/11/2026' }, 'dueDate'],
      ['a due date before the assigned day', { subject: 'math', title: 'x', assignedDate: '2026-11-19', dueDate: '2026-11-18' }, 'dueDate'],
      ['a description of 2001 characters', { subject: 'math', title: 'x', description: 'a'.repeat(2001) }, 'description'],
    ])('creating with %s is a 400 on the right field and creates nothing', async (_n, body, field) => {
      const before = (await overview()).tasks.length;
      const res = await create(body);
      expect(res.statusCode).toBe(400);
      expect(res.json().fields).toHaveProperty(field);
      expect((await overview()).tasks).toHaveLength(before);
    });

    it('creating with an empty body or text that is not JSON is a 400', async () => {
      expect((await create({})).statusCode).toBe(400);
      const raw = await app.inject({ method: 'POST', url: '/api/parent/tasks', payload: '{roto', headers: { cookie, 'content-type': 'application/json' } });
      expect(raw.statusCode).toBe(400);
    });

    it('patching an unknown task is a 404', async () => {
      expect((await call('PATCH', '/api/parent/tasks/no-existe', { hidden: true })).statusCode).toBe(404);
    });

    it.each([
      ['an unknown status', { status: 'hecho' }],
      ['a hidden flag that is not a boolean', { hidden: 'sí' }],
      ['an empty title', { title: '' }],
      ['a title of 201 characters', { title: 'a'.repeat(201) }],
      ['an unknown subject', { subject: 'química' }],
    ])('patching with %s is a 400 and changes nothing', async (_n, patch) => {
      const id = ((await create()).json() as Task).id;
      const before = db.getTask(id);
      expect((await call('PATCH', `/api/parent/tasks/${id}`, patch)).statusCode).toBe(400);
      expect(db.getTask(id)).toEqual(before);
    });

    it('an empty patch, or one with only unknown keys, says there is nothing to change', async () => {
      const id = ((await create()).json() as Task).id;
      for (const patch of [{}, { colorFavorito: 'azul' }]) {
        const res = await call('PATCH', `/api/parent/tasks/${id}`, patch);
        expect(res.statusCode).toBe(400);
        expect(res.json()).toEqual({ error: 'Nada que cambiar' });
      }
    });

    it('unknown keys next to valid ones are ignored', async () => {
      const id = ((await create()).json() as Task).id;
      const res = await call('PATCH', `/api/parent/tasks/${id}`, { hidden: true, source: 'mereb', id: 'otro' });
      expect(res.statusCode).toBe(200);
      expect(db.getTask(id)).toMatchObject({ hidden: true, source: 'manual', id });
    });

    it('deleting an unknown task is a 404, and a second delete of the same task too', async () => {
      expect((await call('DELETE', '/api/parent/tasks/no-existe')).statusCode).toBe(404);
      const id = ((await create()).json() as Task).id;
      expect((await call('DELETE', `/api/parent/tasks/${id}`)).statusCode).toBe(200);
      expect((await call('DELETE', `/api/parent/tasks/${id}`)).statusCode).toBe(404);
    });

    it.each([
      ['a speech rate of 0.6', { speechRate: 0.6 }, 'speechRate'],
      ['a speech rate of 1.3', { speechRate: 1.3 }, 'speechRate'],
      ['an empty name', { childName: '' }, 'childName'],
      ['a name of 31 characters', { childName: 'a'.repeat(31) }, 'childName'],
      ['grade 0', { grade: 0 }, 'grade'],
      ['grade 7', { grade: 7 }, 'grade'],
      ['a language that does not exist', { lang: 'fr' }, 'lang'],
      ['the timezone', { tz: 'America/Bogota' }, 'tz'],
      ['an unknown setting', { colorFavorito: 'azul' }, 'colorFavorito'],
    ])('saving %s is a 400 and keeps the previous settings', async (_n, patch, _field) => {
      const before = (await overview()).settings;
      const res = await call('PUT', '/api/parent/settings', patch);
      expect(res.statusCode).toBe(400);
      expect(Object.keys(res.json().fields).length).toBeGreaterThan(0);
      expect((await overview()).settings).toEqual(before);
    });

    it.each(['0', '13', 'abc', '1.5', '', '-1'])('asking for weeks=%j is a 400', async (weeks) => {
      expect((await call('GET', `/api/parent/progress?weeks=${weeks}`)).statusCode).toBe(400);
    });
  });

  describe('edge', () => {
    it('accepts a title of exactly 200 characters', async () => {
      const res = await create({ subject: 'math', title: 'a'.repeat(200) });
      expect(res.statusCode).toBe(201);
      expect(res.json().title).toHaveLength(200);
    });

    it('stores odd text exactly as written, to be shown as text', async () => {
      const title = '<script>alert(1)</script> "comillas" \'simples\' y 🌱 ñandú\ncon salto';
      const id = ((await create({ subject: 'math', title })).json() as Task).id;
      expect(db.getTask(id)!.title).toBe(title);
      expect((await kid()).tasks.find((t) => t.id === id)!.title).toBe(title);
    });

    it('moving to a day after the due date is refused and the task does not change', async () => {
      const id = ((await create()).json() as Task).id;
      const before = db.getTask(id);
      const res = await call('PATCH', `/api/parent/tasks/${id}`, { assignedDate: '2026-11-25' });
      expect(res.statusCode).toBe(400);
      expect(res.json().fields).toHaveProperty('dueDate');
      expect(db.getTask(id)).toEqual(before);
    });

    it('moving the day and the due date together is fine', async () => {
      const id = ((await create()).json() as Task).id;
      expect((await call('PATCH', `/api/parent/tasks/${id}`, { assignedDate: '2026-11-25', dueDate: '2026-11-26' })).statusCode).toBe(200);
    });

    it('a due date equal to the assigned day is fine', async () => {
      expect((await create({ subject: 'math', title: 'x', assignedDate: '2026-11-19', dueDate: '2026-11-19' })).statusCode).toBe(201);
    });

    it('a task without dates is shown to Lucca', async () => {
      const id = ((await create({ subject: 'math', title: 'Sin fecha' })).json() as Task).id;
      expect((await kid()).tasks.find((t) => t.id === id)).toMatchObject({ assignedDate: null, dueDate: null });
    });

    it('clearing a date with null works', async () => {
      const id = ((await create()).json() as Task).id;
      await call('PATCH', `/api/parent/tasks/${id}`, { dueDate: null });
      expect(db.getTask(id)!.dueDate).toBeNull();
      expect(db.getTask(id)!.assignedDate).toBe('2026-11-19');
    });

    it('a partial patch leaves every other field alone', async () => {
      const id = ((await create({ ...NEW_TASK, titleEn: 'Bring a leaf', description: 'Una hoja' })).json() as Task).id;
      await call('PATCH', `/api/parent/tasks/${id}`, { status: 'doing' });
      expect(db.getTask(id)).toMatchObject({ title: 'Traer una hoja del jardín', titleTranslations: { en: 'Bring a leaf' }, description: 'Una hoja', assignedDate: '2026-11-19', status: 'doing' });
    });

    it('an empty English title removes the translation, a new one replaces it', async () => {
      const id = ((await create({ ...NEW_TASK, titleEn: 'Bring a leaf' })).json() as Task).id;
      await call('PATCH', `/api/parent/tasks/${id}`, { titleEn: 'Bring one leaf' });
      expect(db.getTask(id)!.titleTranslations).toEqual({ en: 'Bring one leaf' });
      await call('PATCH', `/api/parent/tasks/${id}`, { titleEn: '' });
      expect(db.getTask(id)!.titleTranslations).toEqual({});
    });

    it('hiding an already hidden task is harmless', async () => {
      const id = ((await create()).json() as Task).id;
      expect((await call('PATCH', `/api/parent/tasks/${id}`, { hidden: true })).statusCode).toBe(200);
      expect((await call('PATCH', `/api/parent/tasks/${id}`, { hidden: true })).statusCode).toBe(200);
    });

    it('holds thirty tasks on one day', async () => {
      for (let i = 0; i < 30; i++) await create({ subject: 'math', title: `Tarea ${i}`, assignedDate: '2026-11-19' });
      expect((await overview()).tasks).toHaveLength(30);
    });

    it('a task created on Sunday for Monday is stored and shown', async () => {
      clock = Date.parse('2026-11-22T17:00:00Z'); // domingo: la sesión del miércoles ya caducó, hay que volver a entrar
      expect((await call('GET', '/api/parent/overview')).statusCode).toBe(401);
      cookie = String((await app.inject({ method: 'POST', url: '/api/parent/login', payload: { pin: SETUP.pin } })).headers['set-cookie']).split(';')[0];
      const id = ((await create({ subject: 'math', title: 'Para el lunes', assignedDate: '2026-11-23' })).json() as Task).id;
      const k = await kid();
      expect(k.today).toBe('2026-11-22');
      expect(k.tasks.find((t) => t.id === id)!.assignedDate).toBe('2026-11-23');
    });

    it('saving only one setting keeps the rest', async () => {
      await call('PUT', '/api/parent/settings', { lang: 'en' });
      expect((await overview()).settings).toMatchObject({ lang: 'en', childName: 'Lucca', grade: 2, speechRate: 0.9 });
    });

    it('accepts the limits of the speech rate and an empty change', async () => {
      expect((await call('PUT', '/api/parent/settings', { speechRate: 0.7 })).statusCode).toBe(200);
      expect((await call('PUT', '/api/parent/settings', { speechRate: 1.2 })).statusCode).toBe(200);
      expect((await call('PUT', '/api/parent/settings', {})).statusCode).toBe(200);
    });

    it('the overview never carries the PIN or its record', async () => {
      const text = JSON.stringify(await overview());
      expect(text).not.toContain('scrypt$');
      expect(text).not.toContain(SETUP.pin);
    });

    it('twelve weeks without any event are all zeros', async () => {
      const body = (await call('GET', '/api/parent/progress?weeks=12')).json();
      expect(body.weeks).toHaveLength(12);
      for (const w of body.weeks) expect(w).toMatchObject({ total: 0, done: 0, stars: 0, hints: 0, helpRequests: 0 });
      expect(body.needsHelp).toEqual([]);
    });

    it('a hidden task does not count in the progress', async () => {
      db.upsertTask(mk({ id: 'a', assignedDate: '2026-11-17' }));
      db.upsertTask(mk({ id: 'h', assignedDate: '2026-11-17', hidden: true }));
      expect((await call('GET', '/api/parent/progress?weeks=1')).json().weeks[0].total).toBe(1);
    });
  });
});

import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { AgendaPreviewItem, KidState, Task, TaskDraft } from '@lucca/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { LuccaDb } from '../src/db.js';

const WEDNESDAY = Date.parse('2026-11-18T17:00:00Z');
const SETUP = { pin: '482913', childName: 'Lucca', grade: 2, lang: 'es', theme: 'dark' } as const;
const pdf = (name: string) => readFileSync(new URL(`./fixtures/mereb/${name}`, import.meta.url));

interface Preview {
  weekStart: string | null;
  weekEnd: string | null;
  drafts: AgendaPreviewItem[];
}

describe('agenda en PDF', () => {
  let app: FastifyInstance;
  let db: LuccaDb;
  let cookie = '';

  beforeEach(async () => {
    db = new LuccaDb(':memory:');
    app = await buildApp({ db, config: { ...loadConfig({}), aiMode: 'recorded', aiConfigured: true }, now: () => new Date(WEDNESDAY) });
    const res = await app.inject({ method: 'POST', url: '/api/parent/setup', payload: SETUP });
    cookie = String(res.headers['set-cookie']).split(';')[0];
  });
  afterEach(async () => {
    await app.close();
    db.close();
  });

  const upload = (body: Buffer | string, type = 'application/pdf', withCookie = true) =>
    app.inject({ method: 'POST', url: '/api/parent/agenda/pdf', payload: body, headers: { 'content-type': type, ...(withCookie ? { cookie } : {}) } });
  const preview = async (name = 'agenda-ficticia.pdf') => {
    const res = await upload(pdf(name));
    expect(res.statusCode).toBe(200);
    return res.json() as Preview;
  };
  const importTasks = (tasks: unknown[], withCookie = true) =>
    app.inject({ method: 'POST', url: '/api/parent/agenda/import', payload: { tasks }, headers: withCookie ? { cookie } : {} });
  const drafts = (p: Preview): TaskDraft[] => p.drafts.map(({ state: _state, ...d }) => d);
  const kid = async () => (await app.inject({ method: 'GET', url: '/api/kid/state' })).json() as KidState;

  describe('positivo', () => {
    it('el PDF se convierte en tareas propuestas, todas nuevas, sin tocar la base', async () => {
      const p = await preview();
      expect(p.weekStart).toBe('2026-11-15');
      expect(p.drafts).toHaveLength(5);
      expect(p.drafts.every((d) => d.state === 'new')).toBe(true);
      expect(db.listTasks()).toEqual([]);
    });

    it('al añadirlas Lucca las ve en su día de trabajo, con origen Mereb', async () => {
      const p = await preview();
      const res = await importTasks(drafts(p));
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ added: 5, updated: 0, unchanged: 0, skipped: 0 });
      const tasks = (await kid()).tasks;
      expect(tasks).toHaveLength(5);
      const sums = tasks.find((t) => t.subject === 'math')!;
      expect(sums).toMatchObject({ source: 'mereb', status: 'todo', title: 'Sumas con llevadas, pág. 24', dueDate: '2026-11-16', assignedDate: null, subjectLabel: 'Matemáticas' });
      expect(sums.id).toMatch(/^mereb-2026-11-16-matematicas-[0-9a-f]{10}$/);
    });

    it('se pueden añadir solo algunas y con el título corregido por papá', async () => {
      const p = await preview();
      const [first, second] = drafts(p);
      await importTasks([first, { ...second, title: 'Leer «My Pet» y contestar' }]);
      expect(db.listTasks().map((t) => t.title).sort()).toEqual(['Leer «My Pet» y contestar', 'Sumas con llevadas, pág. 24']);
    });

    it('la lección de una tarea importada funciona (IA grabada)', async () => {
      await importTasks(drafts(await preview()));
      const id = db.listTasks().find((t) => t.subject === 'math')!.id;
      const res = await app.inject({ method: 'GET', url: `/api/kid/lessons/${id}` });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('ready');
    });
  });

  describe('negativo', () => {
    it('sin PIN no se puede subir ni importar', async () => {
      expect((await upload(pdf('agenda-ficticia.pdf'), 'application/pdf', false)).statusCode).toBe(401);
      expect((await importTasks([{}], false)).statusCode).toBe(401);
    });

    it('un archivo que no es PDF se rechaza con un mensaje claro', async () => {
      const wrongType = await upload('hola', 'text/plain');
      expect(wrongType.statusCode).toBe(415);
      expect(wrongType.json().error).toBe('Sube el PDF de la agenda');
      const fake = await upload(Buffer.from('esto no es un PDF'));
      expect(fake.statusCode).toBe(422);
      expect(fake.json().error).toBe('No pude leer ese PDF. Descárgalo otra vez desde Mereb e inténtalo de nuevo.');
    });

    it('un PDF sin actividades avisa y no añade nada', async () => {
      const res = await upload(pdf('agenda-vacia.pdf'));
      expect(res.statusCode).toBe(422);
      expect(res.json().error).toBe('No encontré actividades en este PDF. ¿Es la exportación de la agenda de Mereb («Exportar actividades»)?');
      expect(db.listTasks()).toEqual([]);
    });

    it('un PDF de más de 5 MB se rechaza', async () => {
      const big = Buffer.concat([pdf('agenda-ficticia.pdf'), Buffer.alloc(5 * 1024 * 1024)]);
      const res = await upload(big);
      expect(res.statusCode).toBe(413);
      expect(res.json().error).toBe('El PDF pesa más de 5 MB');
    });

    it('importar datos inválidos responde 400 y no guarda nada', async () => {
      const [first] = drafts(await preview());
      for (const bad of [[], [{ ...first, key: '../x' }], [{ ...first, dueDate: '2026-13-01' }], [{ ...first, title: '' }], [{ ...first, subject: 'magia' }]]) {
        expect((await importTasks(bad)).statusCode).toBe(400);
      }
      expect(db.listTasks()).toEqual([]);
    });
  });

  describe('bordes', () => {
    it('importar dos veces la misma agenda no duplica nada', async () => {
      const p = await preview();
      await importTasks(drafts(p));
      const again = await importTasks(drafts(p));
      expect(again.json()).toEqual({ added: 0, updated: 0, unchanged: 5, skipped: 0 });
      expect(db.listTasks()).toHaveLength(5);
      const second = await preview();
      expect(second.drafts.every((d) => d.state === 'same')).toBe(true);
    });

    it('si la docente cambia el día, se actualiza la misma tarea y se conserva el progreso', async () => {
      const [first] = drafts(await preview());
      await importTasks([first]);
      const id = `mereb-${first.key}`;
      await app.inject({ method: 'POST', url: '/api/kid/progress', payload: { taskId: id, kind: 'task_done' } });
      const moved = { ...first, dueDate: '2026-11-17' };
      const res = await importTasks([moved]);
      expect(res.json()).toMatchObject({ added: 0, updated: 1 });
      expect(db.getTask(id)).toMatchObject({ dueDate: '2026-11-17', status: 'done' });
      expect(db.listTasks()).toHaveLength(1);
    });

    it('la vista previa marca lo que cambiaría', async () => {
      const [first] = drafts(await preview());
      await importTasks([{ ...first, description: 'otra cosa' }]);
      const p = await preview();
      expect(p.drafts.find((d) => d.key === first.key)!.state).toBe('update');
    });

    it('un título corregido por papá no cuenta como cambio de la agenda, y reimportar no lo pisa', async () => {
      const [first] = drafts(await preview());
      await importTasks([{ ...first, title: 'Sumas (las del libro)' }]);
      const p = await preview();
      expect(p.drafts.find((d) => d.key === first.key)!.state).toBe('same');
      expect(db.getTask(`mereb-${first.key}`)!.title).toBe('Sumas (las del libro)');
    });

    it('una tarea que papá quitó no vuelve con la siguiente importación', async () => {
      const [first] = drafts(await preview());
      await importTasks([first]);
      const id = `mereb-${first.key}`;
      await app.inject({ method: 'DELETE', url: `/api/parent/tasks/${id}`, headers: { cookie } });
      expect(db.getTask(id)!.retired).toBe(true);
      const res = await importTasks([first]);
      expect(res.json()).toEqual({ added: 0, updated: 0, unchanged: 0, skipped: 1 });
      expect(db.getTask(id)!.retired).toBe(true);
      expect((await preview()).drafts.find((d) => d.key === first.key)!.state).toBe('removed');
    });

    it('si cambia el tema, la lección guardada se descarta para hacer una nueva', async () => {
      const [first] = drafts(await preview());
      await importTasks([first]);
      const id = `mereb-${first.key}`;
      await app.inject({ method: 'GET', url: `/api/kid/lessons/${id}` });
      expect(db.getLesson(id, 'default')).not.toBeNull();
      await importTasks([{ ...first, description: 'Sumas y restas con llevadas' }]);
      expect(db.getLesson(id, 'default')).toBeNull();
    });

    it('las tareas importadas respetan una ocultada por papá', async () => {
      const [first] = drafts(await preview());
      await importTasks([first]);
      const id = `mereb-${first.key}`;
      await app.inject({ method: 'PATCH', url: `/api/parent/tasks/${id}`, payload: { hidden: true }, headers: { cookie } });
      await importTasks([{ ...first, title: 'Sumas con llevadas' }]);
      expect(db.getTask(id) as Task).toMatchObject({ hidden: true, title: 'Sumas con llevadas' });
    });
  });
});

describe('editar una tarea a mano también descarta su lección guardada', () => {
  it('cambiar título o descripción borra la lección; mover de día no', async () => {
    const db = new LuccaDb(':memory:');
    const app = await buildApp({ db, config: { ...loadConfig({}), aiMode: 'recorded', aiConfigured: true }, now: () => new Date(WEDNESDAY) });
    const cookie = String((await app.inject({ method: 'POST', url: '/api/parent/setup', payload: SETUP })).headers['set-cookie']).split(';')[0];
    const task = (await app.inject({ method: 'POST', url: '/api/parent/tasks', payload: { subject: 'math', title: 'Sumas' }, headers: { cookie } })).json() as Task;
    const patch = (body: object) => app.inject({ method: 'PATCH', url: `/api/parent/tasks/${task.id}`, payload: body, headers: { cookie } });
    await app.inject({ method: 'GET', url: `/api/kid/lessons/${task.id}` });
    await patch({ dueDate: '2026-11-20' });
    expect(db.getLesson(task.id, 'default')).not.toBeNull();
    await patch({ title: 'Restas' });
    expect(db.getLesson(task.id, 'default')).toBeNull();
    await app.close();
    db.close();
  });
});

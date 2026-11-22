import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { TaskSchema, type KidState, type Task } from '@lucca/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { LuccaDb } from '../src/db.js';

/** En el modo app (sql.js + MiniFastify) no hay red ni archivos que servir: estas dos solo valen para el servidor. */
const APP_MODE = Boolean((globalThis as { __luccaTestSqlJs?: unknown }).__luccaTestSqlJs);

// 2026-11-18T03:00:00Z = martes 17 a las 22:00 en Panamá.
const NOW = new Date('2026-11-18T03:00:00Z');
let clock = NOW;

function task(partial: Partial<Task> & { id: string }): Task {
  return TaskSchema.parse({ subject: 'math', title: `Tarea ${partial.id}`, source: 'manual', ...partial });
}

describe('app', () => {
  let app: FastifyInstance;
  let db: LuccaDb;
  const dirs: string[] = [];

  async function setup(opts: { webDir?: string | null; tasks?: Task[] } = {}) {
    clock = NOW;
    db = new LuccaDb(':memory:');
    for (const t of opts.tasks ?? []) db.upsertTask(t);
    const config = { ...loadConfig({}), webDir: opts.webDir ?? null, aiConfigured: true, dbPath: '/secret/path/lucca.db' };
    app = await buildApp({ db, config, now: () => clock });
  }
  afterEach(async () => {
    await app?.close();
    db?.close();
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  const state = async () => (await app.inject({ method: 'GET', url: '/api/kid/state' })).json() as KidState;
  const post = (payload: unknown) => app.inject({ method: 'POST', url: '/api/kid/progress', payload: payload as object });

  it('health has no secrets', async () => {
    await setup();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, db: 'ok', ai: 'configured' });
    expect(res.body).not.toContain('/secret/path');
  });

  it.skipIf(APP_MODE)('rejects public addresses and accepts the home network', async () => {
    await setup();
    const pub = await app.inject({ method: 'GET', url: '/api/health', remoteAddress: '8.8.8.8' });
    expect(pub.statusCode).toBe(403);
    expect(pub.json()).toEqual({ error: 'solo red local' });
    const home = await app.inject({ method: 'GET', url: '/api/health', remoteAddress: '192.168.1.50' });
    expect(home.statusCode).toBe(200);
  });

  it('state returns today (in the configured timezone) and the week start', async () => {
    await setup();
    const s = await state();
    expect(s.today).toBe('2026-11-17');
    expect(s.weekStart).toBe('2026-11-16');
    expect(s.settings.tz).toBe('America/Panama');
    expect(s.starsThisWeek).toBe(0);
  });

  it('state hides hidden and retired tasks', async () => {
    await setup({ tasks: [task({ id: 'a' }), task({ id: 'b', hidden: true }), task({ id: 'c', retired: true })] });
    expect((await state()).tasks.map((t) => t.id)).toEqual(['a']);
  });

  it('the first lesson step moves the task from todo to doing', async () => {
    await setup({ tasks: [task({ id: 'a' })] });
    const res = await post({ taskId: 'a', kind: 'lesson_step' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'doing', starsThisWeek: 0 });
    expect(db.getTask('a')!.status).toBe('doing');
  });

  it('task_done marks the task done and gives one star', async () => {
    await setup({ tasks: [task({ id: 'a' })] });
    expect((await post({ taskId: 'a', kind: 'task_done' })).json()).toEqual({ status: 'done', starsThisWeek: 1 });
    expect((await state()).starsThisWeek).toBe(1);
  });

  it('a repeated task_done adds no second star', async () => {
    await setup({ tasks: [task({ id: 'a' })] });
    await post({ taskId: 'a', kind: 'task_done' });
    const second = await post({ taskId: 'a', kind: 'task_done' });
    expect(second.json()).toEqual({ status: 'done', starsThisWeek: 1 });
  });

  it.each(['task_done', 'lesson_done', 'practice_done'] as const)(
    'a repeated %s in a later week gives no new star and logs no second event',
    async (kind) => {
      await setup({ tasks: [task({ id: 'a' })] });
      clock = new Date('2026-11-20T15:00:00Z'); // viernes 20
      expect((await post({ taskId: 'a', kind })).json().starsThisWeek).toBe(1);
      clock = new Date('2026-11-23T15:00:00Z'); // lunes 23: otra semana
      const again = await post({ taskId: 'a', kind });
      expect(again.json().starsThisWeek).toBe(0);
      expect(db.listProgress().filter((e) => e.kind === kind)).toHaveLength(1);
    },
  );

  it('events that give no stars are always logged', async () => {
    await setup({ tasks: [task({ id: 'a' })] });
    await post({ taskId: 'a', kind: 'hint_used' });
    await post({ taskId: 'a', kind: 'hint_used' });
    expect(db.listProgress().filter((e) => e.kind === 'hint_used')).toHaveLength(2);
  });

  it('progress on an unknown or hidden task is 404', async () => {
    await setup({ tasks: [task({ id: 'h', hidden: true })] });
    expect((await post({ taskId: 'nope', kind: 'task_done' })).statusCode).toBe(404);
    expect((await post({ taskId: 'h', kind: 'task_done' })).statusCode).toBe(404);
  });

  it('progress with an invalid body is 400', async () => {
    await setup({ tasks: [task({ id: 'a' })] });
    expect((await post({ taskId: 'a', kind: 'dance' })).statusCode).toBe(400);
    expect((await post({ kind: 'task_done' })).statusCode).toBe(400);
  });

  it.skipIf(APP_MODE)('serves index.html for unknown non-api routes when webDir is set', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lucca-web-'));
    dirs.push(dir);
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Lucca</title><div id="root"></div>');
    await setup({ webDir: dir });
    const res = await app.inject({ method: 'GET', url: '/tarea/abc' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<div id="root">');
  });

  it('an unknown /api route stays a JSON 404', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lucca-web-'));
    dirs.push(dir);
    writeFileSync(join(dir, 'index.html'), '<!doctype html>');
    await setup({ webDir: dir });
    const res = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/json');
  });
});

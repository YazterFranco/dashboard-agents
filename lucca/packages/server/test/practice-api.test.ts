import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { TaskSchema, checkPracticeBlock } from '@lucca/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { LuccaDb } from '../src/db.js';
import { RecordedLessonModel } from '../src/ai/recorded.js';

let app: FastifyInstance;
let db: LuccaDb;
afterEach(async () => {
  await app?.close();
  db?.close();
  (app as unknown) = undefined;
  (db as unknown) = undefined;
});

async function start(withAi = true) {
  db = new LuccaDb(':memory:');
  const add = (id: string, subject: string, title: string, extra = {}) => db.upsertTask(TaskSchema.parse({ id, subject, title, source: 'manual', ...extra }));
  add('sub', 'math', 'Restas sin llevar, pág. 26');
  add('sum', 'math', 'Sumas con llevadas');
  add('plant', 'science', 'Las partes de la planta');
  add('hidden', 'math', 'Restas ocultas', { hidden: true });
  app = await buildApp({
    db,
    config: { ...loadConfig({}), aiMode: withAi ? 'recorded' : 'off' },
    now: () => new Date('2026-11-18T17:00:00Z'),
    lessonModel: withAi ? new RecordedLessonModel() : null,
  });
}
const practice = (id: string) => app.inject({ method: 'GET', url: `/api/kid/practice/${id}` });

describe('practice bank', () => {
  it('subtraction "sin llevar" comes from the generator, 30 valid items, without AI', async () => {
    await start(false);
    const res = (await practice('sub')).json();
    expect(res).toMatchObject({ status: 'ready', source: 'math' });
    expect(res.items).toHaveLength(30);
    for (const item of res.items) expect(checkPracticeBlock(item.block)).toEqual([]);
  });

  it('the same task always gets the same bank (stable), another task another one', async () => {
    await start(false);
    expect((await practice('sub')).json()).toEqual((await practice('sub')).json());
    expect(JSON.stringify((await practice('sum')).json().items)).not.toBe(JSON.stringify((await practice('sub')).json().items));
  });

  it('other subjects use the games of the lesson (prepared if needed)', async () => {
    await start(true);
    const res = (await practice('plant')).json();
    expect(res).toMatchObject({ status: 'ready', source: 'lesson' });
    expect(res.items.length).toBeGreaterThanOrEqual(4);
    expect(res.items.some((i: { block: { type: string } }) => i.block.type === 'explain')).toBe(false);
  });

  it('without AI and without a lesson, a non-math task says it is for later with papá', async () => {
    await start(false);
    expect((await practice('plant')).json()).toEqual({ status: 'unavailable', reason: 'no-ai' });
  });

  it('a missing or hidden task is 404', async () => {
    await start();
    expect((await practice('nope')).statusCode).toBe(404);
    expect((await practice('hidden')).statusCode).toBe(404);
  });

  it('finishing a practice gives one star per task, once', async () => {
    await start(false);
    const done = () => app.inject({ method: 'POST', url: '/api/kid/progress', payload: { taskId: 'sub', kind: 'practice_done' } });
    expect((await done()).json().starsThisWeek).toBe(1);
    expect((await done()).json().starsThisWeek).toBe(1);
  });
});

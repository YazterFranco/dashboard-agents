import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { TaskSchema } from '@lucca/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { LuccaDb } from '../src/db.js';
import { RecordedLessonModel } from '../src/ai/recorded.js';

const WED = '2026-11-18T17:00:00Z';
let app: FastifyInstance;
let db: LuccaDb;
let clock = Date.parse(WED);
afterEach(async () => {
  await app?.close();
  db?.close();
  (app as unknown) = undefined;
  (db as unknown) = undefined;
});

async function start() {
  clock = Date.parse(WED);
  db = new LuccaDb(':memory:');
  db.upsertTask(TaskSchema.parse({ id: 'plant', subject: 'science', title: 'Las partes de la planta', source: 'manual', assignedDate: '2026-11-18' }));
  db.upsertTask(TaskSchema.parse({ id: 'sub', subject: 'math', title: 'Restas sin llevar', source: 'manual', assignedDate: '2026-11-18' }));
  app = await buildApp({ db, config: { ...loadConfig({}), aiMode: 'recorded' }, now: () => new Date(clock), lessonModel: new RecordedLessonModel() });
}
const day = (iso: string) => (clock = Date.parse(iso));
const get = async () => (await app.inject({ method: 'GET', url: '/api/kid/review' })).json() as { today: string; items: { id: string; taskTitle: string; subject: string; question: { type: string } }[]; doneToday: boolean };
const answer = (id: string, correct: boolean) => app.inject({ method: 'POST', url: `/api/kid/review/${encodeURIComponent(id)}`, payload: { correct } });
const finish = () => app.inject({ method: 'POST', url: '/api/kid/review/finish' });
async function finishLesson(taskId: string) {
  await app.inject({ method: 'GET', url: `/api/kid/lessons/${taskId}` });
  await app.inject({ method: 'POST', url: '/api/kid/progress', payload: { taskId, kind: 'lesson_done' } });
}
const state = async () => (await app.inject({ method: 'GET', url: '/api/kid/state' })).json() as { reviewDue: number; starsThisWeek: number };

describe('review — positive', () => {
  it('finishing a lesson saves its questions for tomorrow, not for today', async () => {
    await start();
    await finishLesson('plant');
    expect((await get()).items).toEqual([]);
    expect((await state()).reviewDue).toBe(0);
    day('2026-11-19T17:00:00Z');
    const r = await get();
    expect(r.today).toBe('2026-11-19');
    expect(r.items).toHaveLength(3);
    expect(r.items[0]).toMatchObject({ taskTitle: 'Las partes de la planta', subject: 'science' });
    expect((await state()).reviewDue).toBe(3);
  });

  it('a right answer moves the question to 3 days later; a wrong one keeps it for tomorrow', async () => {
    await start();
    await finishLesson('plant');
    day('2026-11-19T17:00:00Z');
    const [a, b] = (await get()).items;
    expect((await answer(a.id, true)).json()).toEqual({ box: 2, dueDate: '2026-11-22' });
    expect((await answer(b.id, false)).json()).toEqual({ box: 1, dueDate: '2026-11-20' });
    day('2026-11-20T17:00:00Z');
    expect((await get()).items.map((i) => i.id)).toContain(b.id);
    expect((await get()).items.map((i) => i.id)).not.toContain(a.id);
    day('2026-11-22T17:00:00Z');
    expect((await get()).items.map((i) => i.id)).toContain(a.id);
  });

  it('finishing the review gives one star a day', async () => {
    await start();
    await finishLesson('plant');
    const before = (await state()).starsThisWeek;
    day('2026-11-19T17:00:00Z');
    const [a] = (await get()).items;
    await answer(a.id, true);
    expect((await finish()).json()).toMatchObject({ starGained: true, starsThisWeek: before + 1 });
    expect((await finish()).json()).toMatchObject({ starGained: false, starsThisWeek: before + 1 });
    expect((await get()).doneToday).toBe(true);
  });

  it('finishing the same lesson again does not duplicate its questions', async () => {
    await start();
    await finishLesson('plant');
    await finishLesson('plant');
    day('2026-11-19T17:00:00Z');
    expect((await get()).items).toHaveLength(3);
  });
});

describe('review — negative', () => {
  it('an unknown question is 404 and a bad body 400', async () => {
    await start();
    expect((await answer('nope', true)).statusCode).toBe(404);
    await finishLesson('plant');
    day('2026-11-19T17:00:00Z');
    const [a] = (await get()).items;
    expect((await app.inject({ method: 'POST', url: `/api/kid/review/${encodeURIComponent(a.id)}`, payload: { correct: 'yes' } })).statusCode).toBe(400);
  });

  it('finishing without answering anything gives no star', async () => {
    await start();
    const res = await finish();
    expect(res.statusCode).toBe(400);
    expect((await state()).starsThisWeek).toBe(0);
  });

  it('questions of a task papá hid do not come back', async () => {
    await start();
    await finishLesson('plant');
    db.upsertTask({ ...db.getTask('plant')!, hidden: true });
    day('2026-11-19T17:00:00Z');
    expect((await get()).items).toEqual([]);
  });
});

describe('review — edge', () => {
  it('answering the same question twice the same day does not jump two boxes', async () => {
    await start();
    await finishLesson('plant');
    day('2026-11-19T17:00:00Z');
    const [a] = (await get()).items;
    await answer(a.id, true);
    expect((await answer(a.id, true)).json()).toEqual({ box: 2, dueDate: '2026-11-22' });
  });

  it('never more than 5 questions a day, even after several lessons', async () => {
    await start();
    await finishLesson('plant');
    await finishLesson('sub');
    day('2026-11-19T17:00:00Z');
    expect((await get()).items).toHaveLength(5);
  });

  it('a question missed days ago is still waiting (it does not get lost)', async () => {
    await start();
    await finishLesson('plant');
    day('2026-11-30T17:00:00Z');
    expect((await get()).items).toHaveLength(3);
  });

  it('papá sees how many are learned and pending', async () => {
    await start();
    await finishLesson('plant');
    const res = await app.inject({ method: 'POST', url: '/api/parent/setup', payload: { pin: '482913', childName: 'Lucca', grade: 2, lang: 'es', theme: 'dark' } });
    const cookie = String(res.headers['set-cookie']).split(';')[0];
    const progress = (await app.inject({ method: 'GET', url: '/api/parent/progress', headers: { cookie } })).json();
    expect(progress.review).toEqual({ total: 3, learned: 0, due: 0 });
  });
});

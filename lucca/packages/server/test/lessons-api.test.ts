import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { TaskSchema, checkLesson, type LessonDoc } from '@lucca/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { LuccaDb } from '../src/db.js';
import type { LessonModel, ModelResult } from '../src/ai/generate.js';
import { RecordedLessonModel } from '../src/ai/recorded.js';

const NOW = Date.parse('2026-11-18T17:00:00Z');
const SETUP = { pin: '482913', childName: 'Lucca', grade: 2, lang: 'es', theme: 'dark' } as const;
const usage = { inputTokens: 100_000, outputTokens: 50_000, cacheReadTokens: 0, cacheWriteTokens: 0 }; // 0,40 + 1,00 = 1,40 USD

let app: FastifyInstance;
let db: LuccaDb;
afterEach(async () => {
  await app?.close();
  db?.close();
  (app as unknown) = undefined;
  (db as unknown) = undefined;
});

function spyModel(base: LessonModel = new RecordedLessonModel(), withUsage = false) {
  const generate = vi.fn(async (req: Parameters<LessonModel['generate']>[0]): Promise<ModelResult> => {
    const out = await base.generate(req);
    return withUsage ? { ...out, usage } : out;
  });
  return { generate };
}

async function start(opts: { model?: LessonModel | null; aiMode?: 'live' | 'recorded' | 'off'; timeoutMs?: number } = {}) {
  db = new LuccaDb(':memory:');
  db.upsertTask(TaskSchema.parse({ id: 'plant', subject: 'science', title: 'Las partes de la planta', source: 'manual', assignedDate: '2026-11-18' }));
  db.upsertTask(TaskSchema.parse({ id: 'hidden', subject: 'math', title: 'Oculta', source: 'manual', hidden: true }));
  app = await buildApp({
    db,
    config: { ...loadConfig({}), aiMode: opts.aiMode ?? 'recorded' },
    now: () => new Date(NOW),
    lessonModel: opts.model === undefined ? spyModel() : opts.model,
    lessonTimeoutMs: opts.timeoutMs,
  });
}
const kid = (url: string) => app.inject({ method: 'GET', url });
async function parentCookie() {
  const res = await app.inject({ method: 'POST', url: '/api/parent/setup', payload: SETUP });
  return String(res.headers['set-cookie']).split(';')[0];
}

describe('kid lessons — positive', () => {
  it('generates a lesson the first time and serves the stored one afterwards, without asking again', async () => {
    const model = spyModel();
    await start({ model });
    const first = await kid('/api/kid/lessons/plant');
    expect(first.statusCode).toBe(200);
    const body = first.json() as { status: string; lesson: { doc: LessonDoc; variant: string; source: string } };
    expect(body.status).toBe('ready');
    expect(body.lesson.variant).toBe('default');
    expect(body.lesson.source).toBe('recorded');
    expect(checkLesson(body.lesson.doc)).toEqual([]);
    const second = await kid('/api/kid/lessons/plant');
    expect(second.json()).toEqual(body);
    expect(model.generate).toHaveBeenCalledTimes(1);
  });

  it('the alternative explanation is a separate stored lesson with another approach', async () => {
    const model = spyModel();
    await start({ model });
    const a = (await kid('/api/kid/lessons/plant')).json();
    const b = (await kid('/api/kid/lessons/plant?variant=alternative')).json();
    expect(b.lesson.variant).toBe('alternative');
    expect(JSON.stringify(a.lesson.doc)).not.toBe(JSON.stringify(b.lesson.doc));
    expect(model.generate.mock.calls[1][0].variant).toBe('alternative');
  });

  it('the request to the AI never carries the child name', async () => {
    const model = spyModel();
    await start({ model });
    await kid('/api/kid/lessons/plant');
    expect(JSON.stringify(model.generate.mock.calls[0][0])).not.toMatch(/Lucca/);
  });

  it('two requests at the same time generate only once', async () => {
    const model = spyModel();
    await start({ model });
    const [a, b] = await Promise.all([kid('/api/kid/lessons/plant'), kid('/api/kid/lessons/plant')]);
    expect(a.json()).toEqual(b.json());
    expect(model.generate).toHaveBeenCalledTimes(1);
  });

  it('finishing the lesson gives one star, only once', async () => {
    await start();
    await kid('/api/kid/lessons/plant');
    const done = () => app.inject({ method: 'POST', url: '/api/kid/progress', payload: { taskId: 'plant', kind: 'lesson_done' } });
    expect((await done()).json().starsThisWeek).toBe(1);
    expect((await done()).json().starsThisWeek).toBe(1);
  });
});

describe('kid lessons — negative', () => {
  it('a task that does not exist, or is hidden, is 404', async () => {
    await start();
    expect((await kid('/api/kid/lessons/nope')).statusCode).toBe(404);
    expect((await kid('/api/kid/lessons/hidden')).statusCode).toBe(404);
  });

  it('an unknown variant is 400', async () => {
    await start();
    expect((await kid('/api/kid/lessons/plant?variant=hack')).statusCode).toBe(400);
  });

  it('without AI it says so kindly (the mascot sends him to papá), with no error', async () => {
    await start({ model: null, aiMode: 'off' });
    const res = await kid('/api/kid/lessons/plant');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'unavailable', reason: 'no-ai' });
  });

  it('a lesson already stored is still served when the AI is off', async () => {
    await start({ model: spyModel() });
    await kid('/api/kid/lessons/plant');
    await app.close();
    app = await buildApp({ db, config: { ...loadConfig({}), aiMode: 'off' }, now: () => new Date(NOW), lessonModel: null });
    expect((await kid('/api/kid/lessons/plant')).json().status).toBe('ready');
  });

  it('when the AI keeps failing, Lucca gets the simple fallback lesson and papá sees an alert', async () => {
    const broken: LessonModel = { generate: async () => ({ kind: 'ok', doc: { broken: true }, usage }) };
    await start({ model: broken, aiMode: 'live' });
    const res = (await kid('/api/kid/lessons/plant')).json();
    expect(res.status).toBe('ready');
    expect(res.lesson.source).toBe('fallback');
    expect(checkLesson(res.lesson.doc)).toEqual([]);
    const cookie = await parentCookie();
    const overview = (await app.inject({ method: 'GET', url: '/api/parent/overview', headers: { cookie } })).json();
    expect(overview.ai.alerts).toEqual([expect.objectContaining({ taskId: 'plant', title: 'Las partes de la planta' })]);
  });
});

describe('AI spending', () => {
  it('records the cost of every attempt and shows the month total to papá', async () => {
    await start({ model: spyModel(undefined, true), aiMode: 'live' });
    await kid('/api/kid/lessons/plant');
    const cookie = await parentCookie();
    const overview = (await app.inject({ method: 'GET', url: '/api/parent/overview', headers: { cookie } })).json();
    expect(overview.ai).toMatchObject({ mode: 'live', capUsd: 20 });
    expect(overview.ai.monthCostUsd).toBeCloseTo(1.4, 5);
  });

  it('at the monthly cap no new AI calls are made; saved lessons still work', async () => {
    const model = spyModel(undefined, true);
    await start({ model, aiMode: 'live' });
    await kid('/api/kid/lessons/plant');
    db.setSettings({ aiMonthlyCapUsd: 1 });
    expect((await kid('/api/kid/lessons/plant')).json().status).toBe('ready');
    expect((await kid('/api/kid/lessons/plant?variant=alternative')).json()).toEqual({ status: 'unavailable', reason: 'cap' });
    expect(model.generate).toHaveBeenCalledTimes(1);
  });

  it('spending from last month does not count', async () => {
    const model = spyModel(undefined, true);
    await start({ model, aiMode: 'live' });
    db.addAiUsage({ id: 'old', at: '2026-10-31T12:00:00Z', taskId: 'plant', purpose: 'lesson', usage, costUsd: 50 });
    expect((await kid('/api/kid/lessons/plant')).json().status).toBe('ready');
  });
});

describe('edge', () => {
  it('a very slow AI: after the wait limit Lucca is told to try in a moment, and the lesson is kept when it arrives', async () => {
    let release!: () => void;
    const slow: LessonModel = {
      generate: (req) =>
        new Promise((resolve) => {
          release = () => void new RecordedLessonModel().generate(req).then(resolve);
        }),
    };
    await start({ model: slow, timeoutMs: 30 });
    expect((await kid('/api/kid/lessons/plant')).json()).toEqual({ status: 'unavailable', reason: 'slow' });
    release();
    await new Promise((r) => setTimeout(r, 20));
    expect((await kid('/api/kid/lessons/plant')).json().status).toBe('ready');
  });
});

describe('parent lessons', () => {
  it('preview and regenerate need the PIN', async () => {
    await start();
    expect((await app.inject({ method: 'GET', url: '/api/parent/lessons/plant' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/parent/lessons/plant/regenerate' })).statusCode).toBe(401);
  });

  it('papá previews the same lesson Lucca sees, and regenerating asks the AI again', async () => {
    const model = spyModel();
    await start({ model });
    const cookie = await parentCookie();
    const seen = (await kid('/api/kid/lessons/plant')).json();
    const preview = (await app.inject({ method: 'GET', url: '/api/parent/lessons/plant', headers: { cookie } })).json();
    expect(preview).toEqual(seen);
    const again = await app.inject({ method: 'POST', url: '/api/parent/lessons/plant/regenerate', headers: { cookie } });
    expect(again.json().status).toBe('ready');
    expect(model.generate).toHaveBeenCalledTimes(2);
  });

  it('papá can preview a hidden task lesson too, but not a missing one', async () => {
    await start();
    const cookie = await parentCookie();
    expect((await app.inject({ method: 'GET', url: '/api/parent/lessons/hidden', headers: { cookie } })).json().status).toBe('ready');
    expect((await app.inject({ method: 'GET', url: '/api/parent/lessons/nope', headers: { cookie } })).statusCode).toBe(404);
  });

  it('the cap can be changed in the settings, within 1 to 200 dollars', async () => {
    await start();
    const cookie = await parentCookie();
    const put = (v: unknown) => app.inject({ method: 'PUT', url: '/api/parent/settings', headers: { cookie }, payload: { aiMonthlyCapUsd: v } });
    expect((await put(35)).statusCode).toBe(200);
    expect((await put(0)).statusCode).toBe(400);
    expect((await put(500)).statusCode).toBe(400);
  });
});

describe('monthStartIso', () => {
  it('is local midnight of the 1st in Panama (05:00 UTC)', async () => {
    const { monthStartIso } = await import('../src/lessons.js');
    expect(monthStartIso(new Date('2026-11-18T17:00:00Z'), 'America/Panama')).toBe('2026-11-01T05:00:00.000Z');
    // 1 de diciembre a las 02:00 UTC todavía es 30 de noviembre en Panamá.
    expect(monthStartIso(new Date('2026-12-01T02:00:00Z'), 'America/Panama')).toBe('2026-11-01T05:00:00.000Z');
  });
});

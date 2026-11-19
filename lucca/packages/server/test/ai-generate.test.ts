import { describe, expect, it, vi } from 'vitest';
import { LessonDocSchema, bi, checkLesson, type LessonDoc } from '@lucca/shared';
import { fallbackLesson } from '../src/ai/fallback';
import { generateLesson, type LessonModel, type LessonRequest, type ModelResult } from '../src/ai/generate';
import { RecordedLessonModel, RECORDED_KEYS } from '../src/ai/recorded';

const request: LessonRequest = {
  task: { subject: 'science', title: 'Las partes de la planta', titleEn: 'The parts of a plant', description: '' },
  grade: 2,
  variant: 'default',
};
const usage = { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0 };

/** Un modelo de mentira que devuelve, en orden, lo que se le da. */
function scripted(...answers: (ModelResult | Error)[]): LessonModel & { calls: LessonRequest[] } {
  const calls: LessonRequest[] = [];
  return {
    calls,
    async generate(req) {
      calls.push(req);
      const next = answers.shift();
      if (!next) throw new Error('sin más respuestas');
      if (next instanceof Error) throw next;
      return next;
    },
  };
}
const good = async (): Promise<LessonDoc> => ((await new RecordedLessonModel().generate(request)) as { doc: LessonDoc }).doc;

describe('generateLesson', () => {
  it('returns the first valid lesson and its usage', async () => {
    const doc = await good();
    const model = scripted({ kind: 'ok', doc, usage });
    const out = await generateLesson(model, request);
    expect(out).toMatchObject({ source: 'ai', attempts: 1 });
    expect(out.doc).toEqual(doc);
    expect(out.usage).toEqual([usage]);
  });

  it('retries with the reasons when the answer breaks the rules, and keeps the usage of every attempt', async () => {
    const doc = await good();
    const tooShort = { ...doc, screens: doc.screens.slice(0, 2) };
    const model = scripted({ kind: 'ok', doc: tooShort, usage }, { kind: 'ok', doc, usage });
    const out = await generateLesson(model, request);
    expect(out).toMatchObject({ source: 'ai', attempts: 2 });
    expect(model.calls[1].previousIssues?.join(' ')).toMatch(/entre 4 y 6 pantallas/);
    expect(out.usage).toHaveLength(2);
  });

  it('an answer that is not even the schema also counts as a failed attempt', async () => {
    const doc = await good();
    const model = scripted({ kind: 'ok', doc: { hola: 1 }, usage }, { kind: 'ok', doc, usage });
    expect((await generateLesson(model, request)).attempts).toBe(2);
    expect(model.calls[1].previousIssues?.length).toBeGreaterThan(0);
  });

  it('after three bad answers it gives the simple fallback lesson, never a broken one', async () => {
    const bad = { kind: 'ok' as const, doc: { nope: true }, usage };
    const out = await generateLesson(scripted(bad, bad, bad), request);
    expect(out.source).toBe('fallback');
    expect(out.attempts).toBe(3);
    expect(checkLesson(out.doc)).toEqual([]);
    expect(out.issues.length).toBeGreaterThan(0);
  });

  it('a refusal goes straight to the fallback (no point retrying the same request)', async () => {
    const model = scripted({ kind: 'refusal', usage });
    const out = await generateLesson(model, request);
    expect(out).toMatchObject({ source: 'fallback', attempts: 1 });
    expect(out.issues.join(' ')).toMatch(/rechaz/);
  });

  it('API errors are retried and end in the fallback too', async () => {
    const out = await generateLesson(scripted(new Error('500'), new Error('500'), new Error('500')), request);
    expect(out.source).toBe('fallback');
  });

  it('an error then a good answer is fine', async () => {
    const doc = await good();
    const out = await generateLesson(scripted(new Error('timeout'), { kind: 'ok', doc, usage }), request);
    expect(out).toMatchObject({ source: 'ai', attempts: 2 });
  });
});

describe('fallbackLesson', () => {
  it.each(['math', 'spanish', 'english', 'science', 'social', 'art', 'music', 'pe', 'religion', 'other'] as const)('passes every check for %s', (subject) => {
    const doc = fallbackLesson({ subject, title: 'Leer la página 24 y contestar con buena letra todas las preguntas', titleEn: '', description: '' });
    expect(LessonDocSchema.safeParse(doc).success).toBe(true);
    expect(checkLesson(doc)).toEqual([]);
  });
  it('uses the task title, in English when there is one', () => {
    const doc = fallbackLesson({ subject: 'math', title: 'Sumas', titleEn: 'Sums', description: '' });
    expect(doc.title).toEqual(bi('Sumas', 'Sums'));
  });
});

describe('RecordedLessonModel', () => {
  const titles: [string, string][] = [
    ['science', 'Las partes de la planta'],
    ['math', 'Restas sin llevar, pág. 26'],
    ['math', 'Sumas con llevadas, pág. 24'],
    ['english', 'Palabras: cat, hat, bat'],
    ['english', 'Lectura: “My Pet”'],
    ['spanish', 'Leer “La semilla mágica” y dibujar el final'],
    ['art', 'Dibujo de mi familia'],
    ['math', 'Problemas con monedas'],
    ['science', 'Traer una hoja del jardín'],
    ['spanish', 'Dictado de palabras con “ll”'],
    ['music', 'Algo que no está grabado'],
  ];
  it.each(titles)('%s · %s: a recorded lesson that passes every check, in both variants', async (subject, title) => {
    for (const variant of ['default', 'alternative'] as const) {
      const out = await new RecordedLessonModel().generate({ ...request, task: { subject: subject as never, title, titleEn: '', description: '' }, variant });
      expect(out.kind).toBe('ok');
      const doc = LessonDocSchema.parse((out as { doc: unknown }).doc);
      expect(checkLesson(doc)).toEqual([]);
    }
  });
  it('the alternative explanation is different from the first one', async () => {
    const a = await new RecordedLessonModel().generate(request);
    const b = await new RecordedLessonModel().generate({ ...request, variant: 'alternative' });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
  it('has the demo topics recorded', () => {
    expect(RECORDED_KEYS.length).toBeGreaterThanOrEqual(5);
  });
  it('costs nothing and uses no network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const out = await new RecordedLessonModel().generate(request);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect((out as { usage: unknown }).usage).toEqual({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });
    fetchSpy.mockRestore();
  });
});

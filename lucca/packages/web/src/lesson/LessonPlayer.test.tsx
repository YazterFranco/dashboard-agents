// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { bi, type LessonDoc, type VoiceMode } from '@lucca/shared';
import { task } from '../testFixtures';
import type { Speaker } from '../speaker';
import type { LessonAnswer } from './api';
import { LessonPlayer, defaultContentLang } from './LessonPlayer';

afterEach(cleanup);

const doc = (title = 'Planta'): LessonDoc => ({
  title: bi(title, 'Plant'),
  screens: [
    { blocks: [{ type: 'explain', text: bi('Una planta crece.', 'A plant grows.') }] },
    { blocks: [{ type: 'explain', text: bi('La raíz bebe agua.', 'The root drinks water.') }] },
  ],
  quiz: [{ type: 'trueFalse', statement: bi('La raíz bebe agua.', 'The root drinks water.'), answer: true }],
});
const ready = (d: LessonDoc, variant: 'default' | 'alternative' = 'default'): LessonAnswer => ({ status: 'ready', lesson: { doc: d, variant, source: 'recorded' } });

function setup(opts: { load?: (v: 'default' | 'alternative') => Promise<LessonAnswer>; voiceMode?: VoiceMode; subject?: 'science' | 'english'; preview?: boolean; stars?: number } = {}) {
  const speaker = { available: () => true, speak: vi.fn(), stop: vi.fn(), speaking: false } as unknown as Speaker & { speak: ReturnType<typeof vi.fn> };
  const load = vi.fn(opts.load ?? (async (v) => ready(v === 'alternative' ? doc('Otra forma') : doc(), v)));
  const onProgress = vi.fn(async () => ({ ok: true as const, starsGained: opts.stars ?? 1 }));
  const onClose = vi.fn();
  render(
    <LessonPlayer
      task={task({ id: 't1', subject: opts.subject ?? 'science', title: 'Las partes de la planta' })}
      lang="es"
      voiceMode={opts.voiceMode ?? 'both'}
      speaker={speaker}
      load={load}
      onProgress={opts.preview ? undefined : onProgress}
      onClose={onClose}
    />,
  );
  return { speaker, load, onProgress, onClose };
}
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

describe('LessonPlayer positive', () => {
  it('shows the wait, then the first screen with its step, and moves forward and back', async () => {
    let resolve!: (a: LessonAnswer) => void;
    setup({ load: () => new Promise((r) => (resolve = r)) });
    expect(screen.getByRole('status').textContent).toBe('Estoy preparando tu lección…');
    await act(async () => resolve(ready(doc())));
    expect(screen.getByText('Paso 1 de 3')).toBeTruthy();
    expect(screen.getByText('Una planta crece.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Atrás' }) as HTMLButtonElement).disabled).toBe(true);
    click('Siguiente');
    expect(screen.getByText('Paso 2 de 3')).toBeTruthy();
    click('Atrás');
    expect(screen.getByText('Paso 1 de 3')).toBeTruthy();
  });

  it('the questions must be answered before finishing; finishing gives the star and marks the lesson', async () => {
    const { onProgress, onClose } = setup();
    await screen.findByText('Paso 1 de 3');
    click('Siguiente');
    click('Siguiente');
    expect(screen.getByText('Pregunta 1 de 1')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Terminar' }) as HTMLButtonElement).disabled).toBe(true);
    click(/Verdadero/);
    await act(async () => click('Terminar'));
    expect(onProgress).toHaveBeenCalledWith('t1', 'lesson_step');
    expect(onProgress).toHaveBeenCalledWith('t1', 'lesson_done');
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('heading', { name: '¡Lo entendiste!' })).toBeTruthy();
    expect(screen.getByText(/Ganaste una estrella/)).toBeTruthy();
    click(/Volver a mi semana/);
    expect(onClose).toHaveBeenCalled();
  });

  it('lesson_step is sent only once, even going back and forward', async () => {
    const { onProgress } = setup();
    await screen.findByText('Paso 1 de 3');
    click('Siguiente');
    click('Atrás');
    click('Siguiente');
    expect(onProgress.mock.calls.filter((c) => (c as unknown[])[1] === 'lesson_step')).toHaveLength(1);
  });

  it('a second time (no new star) says it was understood without promising a star', async () => {
    setup({ stars: 0 });
    await screen.findByText('Paso 1 de 3');
    click('Siguiente');
    click('Siguiente');
    click(/Verdadero/);
    await act(async () => click('Terminar'));
    expect(screen.queryByText(/Ganaste una estrella/)).toBeNull();
  });

  it('English homework opens in English and can switch to Spanish without losing the step', async () => {
    setup({ subject: 'english' });
    await screen.findByText('A plant grows.');
    click('Siguiente');
    click('¿Me lo dices en español?');
    expect(screen.getByText('La raíz bebe agua.')).toBeTruthy();
    expect(screen.getByText('Paso 2 de 3')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tell me in English?' })).toBeTruthy();
  });

  it('"Explícamelo de otra forma" loads the other approach from the start', async () => {
    const { load } = setup();
    await screen.findByText('Paso 1 de 3');
    click('Siguiente');
    await act(async () => click('Explícamelo de otra forma'));
    expect(load).toHaveBeenLastCalledWith('alternative');
    expect(screen.getByRole('heading', { name: 'Otra forma' })).toBeTruthy();
    expect(screen.getByText('Paso 1 de 3')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Explícamelo de otra forma' })).toBeNull();
  });

  it('two misses on a question make the mascot offer another explanation', async () => {
    const block = { type: 'choice' as const, question: bi('¿Qué?', 'What?'), options: [bi('A', 'A'), bi('B', 'B'), bi('C', 'C')].map((text) => ({ text })), correct: 0 };
    const d = { ...doc(), quiz: [block] };
    const { load } = setup({ load: async (v) => ready(v === 'alternative' ? doc('Otra forma') : d, v) });
    await screen.findByText('Paso 1 de 3');
    click('Siguiente');
    click('Siguiente');
    click('B');
    expect(screen.queryByText('¿Te lo explico de otra forma?')).toBeNull();
    click('C');
    expect(screen.getByText('¿Te lo explico de otra forma?')).toBeTruthy();
    await act(async () => click('Sí, explícamelo'));
    expect(load).toHaveBeenLastCalledWith('alternative');
  });

  it('reads each screen aloud in "both" mode, with the language of each part', async () => {
    const { speaker } = setup();
    await screen.findByText('Paso 1 de 3');
    await waitFor(() => expect(speaker.speak).toHaveBeenLastCalledWith([{ text: 'Una planta crece.', lang: 'es' }]));
    click('Siguiente');
    await waitFor(() => expect(speaker.speak).toHaveBeenLastCalledWith([{ text: 'La raíz bebe agua.', lang: 'es' }]));
  });
});

describe('LessonPlayer negative', () => {
  it.each([
    ['no-ai', 'Esta tarea la vemos con papá.', false],
    ['cap', 'Esta tarea la vemos con papá.', false],
    ['slow', 'Sigo preparando tu lección. Inténtalo en un ratito.', true],
  ] as const)('unavailable (%s) shows a kind message', async (reason, message, retry) => {
    const { load } = setup({ load: async () => ({ status: 'unavailable', reason }) });
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(message));
    expect(Boolean(screen.queryByRole('button', { name: 'Intentar de nuevo' }))).toBe(retry);
    if (retry) {
      await act(async () => click('Intentar de nuevo'));
      expect(load).toHaveBeenCalledTimes(2);
    }
  });

  it('no connection says so without technical words, and the retry works', async () => {
    const load = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(ready(doc()));
    setup({ load });
    await screen.findByText('No encuentro tu lección ahora. ¡Díselo a papá!');
    expect(document.body.textContent).not.toMatch(/fetch|TypeError/);
    await act(async () => click('Intentar de nuevo'));
    expect(screen.getByText('Paso 1 de 3')).toBeTruthy();
  });

  it('if the other explanation is not available, the lesson stays and the mascot sends him to papá', async () => {
    setup({ load: async (v) => (v === 'alternative' ? { status: 'unavailable', reason: 'cap' } : ready(doc())) });
    await screen.findByText('Paso 1 de 3');
    await act(async () => click('Explícamelo de otra forma'));
    expect(screen.getByText('Una planta crece.')).toBeTruthy();
    expect(screen.getByText('Esta tarea la vemos con papá.')).toBeTruthy();
  });
});

describe('LessonPlayer edge', () => {
  it('preview (papá) never counts as progress', async () => {
    const { onProgress } = setup({ preview: true });
    await screen.findByText('Paso 1 de 3');
    click('Siguiente');
    click('Siguiente');
    click(/Verdadero/);
    await act(async () => click('Terminar'));
    expect(onProgress).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: '¡Lo entendiste!' })).toBeTruthy();
  });

  it('"Leer" mode does not speak and has no listen button', async () => {
    const { speaker } = setup({ voiceMode: 'text' });
    await screen.findByText('Paso 1 de 3');
    expect(speaker.speak).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Escuchar esta pantalla' })).toBeNull();
  });

  it('"Escuchar" mode speaks but the listen button is there too', async () => {
    setup({ voiceMode: 'audio' });
    await screen.findByText('Paso 1 de 3');
    expect(screen.getByRole('button', { name: 'Escuchar esta pantalla' })).toBeTruthy();
  });

  it('the content language follows the subject', () => {
    expect(defaultContentLang(task({ id: 'a', subject: 'english' }), 'es')).toBe('en');
    expect(defaultContentLang(task({ id: 'a', subject: 'spanish' }), 'en')).toBe('es');
    expect(defaultContentLang(task({ id: 'a', subject: 'math' }), 'en')).toBe('en');
  });
});

describe('LessonPlayer regression', () => {
  it('a new load function on re-render (the week state changed) does not reload or restart the lesson', async () => {
    const speaker = { available: () => true, speak: vi.fn(), stop: vi.fn(), speaking: false } as unknown as Speaker;
    const first = vi.fn(async () => ready(doc()));
    const props = { task: task({ id: 't1', subject: 'science' }), lang: 'es' as const, voiceMode: 'text' as const, speaker, onClose: vi.fn() };
    const { rerender } = render(<LessonPlayer {...props} load={first} />);
    await screen.findByText('Paso 1 de 3');
    click('Siguiente');
    const second = vi.fn(async () => ready(doc()));
    rerender(<LessonPlayer {...props} load={second} />);
    await act(async () => {});
    expect(second).not.toHaveBeenCalled();
    expect(screen.getByText('Paso 2 de 3')).toBeTruthy();
  });
});

describe('LessonPlayer finishing offline', () => {
  it('if saving the finish fails, it says so and the retry saves it', async () => {
    const speaker = { available: () => true, speak: vi.fn(), stop: vi.fn(), speaking: false } as unknown as Speaker;
    const onProgress = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, starsGained: 0 }) // lesson_step
      .mockResolvedValueOnce({ ok: false }) // lesson_done falla
      .mockResolvedValueOnce({ ok: true, starsGained: 1 }); // reintento
    render(<LessonPlayer task={task({ id: 't1', subject: 'science' })} lang="es" voiceMode="text" speaker={speaker} load={async () => ready(doc())} onProgress={onProgress} onClose={vi.fn()} />);
    await screen.findByText('Paso 1 de 3');
    click('Siguiente');
    click('Siguiente');
    click(/Verdadero/);
    await act(async () => click('Terminar'));
    expect(screen.getByText('No pude guardar tu avance. Revisa la conexión e inténtalo otra vez.')).toBeTruthy();
    expect(screen.queryByText(/Ganaste una estrella/)).toBeNull();
    await act(async () => click('Intentar de nuevo'));
    expect(onProgress).toHaveBeenLastCalledWith('t1', 'lesson_done');
    expect(screen.getByText(/Ganaste una estrella/)).toBeTruthy();
    expect(screen.queryByText(/No pude guardar/)).toBeNull();
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { bi, type VoiceMode } from '@lucca/shared';
import type { Speaker } from '../speaker';
import type { ReviewApi, ReviewItemView } from './api';
import { ReviewPlayer } from './ReviewPlayer';

afterEach(cleanup);

const items: ReviewItemView[] = [
  { id: 'a', subject: 'science', taskTitle: 'Las partes de la planta', question: { type: 'trueFalse', statement: bi('La raíz bebe agua.', 'The root drinks water.'), answer: true } },
  { id: 'b', subject: 'english', taskTitle: 'Palabras: cat, hat, bat', question: { type: 'choice', question: bi('¿Cuál es el gato?', 'Which one is the cat?'), options: [{ text: bi('cat', 'cat') }, { text: bi('hat', 'hat') }], correct: 0 } },
];

function setup(over: Partial<Record<keyof ReviewApi, unknown>> = {}, voiceMode: VoiceMode = 'text') {
  const api = {
    today: vi.fn(async () => ({ today: '2026-11-19', items, doneToday: false })),
    answer: vi.fn(async () => ({ box: 2, dueDate: '2026-11-22' })),
    finish: vi.fn(async () => ({ starGained: true, starsThisWeek: 3 })),
    ...over,
  } as unknown as ReviewApi & Record<string, ReturnType<typeof vi.fn>>;
  const speaker = { available: () => true, speak: vi.fn(), stop: vi.fn(), speaking: false } as unknown as Speaker & { speak: ReturnType<typeof vi.fn> };
  const onClose = vi.fn();
  render(<ReviewPlayer lang="es" voiceMode={voiceMode} speaker={speaker} api={api} onClose={onClose} />);
  return { api, onClose, speaker };
}
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

describe('ReviewPlayer positive', () => {
  it('goes through the due questions, records the first try, and finishing gives the star', async () => {
    const { api, onClose } = setup();
    await screen.findByText('Pregunta 1 de 2');
    expect(screen.getByText('Las partes de la planta')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Siguiente' }) as HTMLButtonElement).disabled).toBe(true);
    click(/Verdadero/);
    expect(api.answer).toHaveBeenCalledWith('a', true);
    click('Siguiente');
    await screen.findByText('Pregunta 2 de 2');
    expect(screen.getByText('Which one is the cat?')).toBeTruthy();
    click('hat');
    click('cat');
    expect(api.answer).toHaveBeenLastCalledWith('b', false);
    expect(api.answer).toHaveBeenCalledTimes(2);
    await act(async () => click('Terminar'));
    expect(screen.getByRole('heading', { name: '¡Repaso terminado!' })).toBeTruthy();
    expect(screen.getByText(/Ganaste una estrella/)).toBeTruthy();
    click(/Volver a mi semana/);
    expect(onClose).toHaveBeenCalled();
  });

  it('reads the question aloud when the voice is on', async () => {
    const { speaker } = setup({}, 'both');
    await screen.findByText('Pregunta 1 de 2');
    await waitFor(() => expect(speaker.speak).toHaveBeenCalledWith([{ text: 'La raíz bebe agua.', lang: 'es' }]));
  });
});

describe('ReviewPlayer negative and edge', () => {
  it('nothing due says so kindly', async () => {
    setup({ today: vi.fn(async () => ({ today: 'x', items: [], doneToday: true })) });
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Hoy no hay nada que repasar. ¡Bien!'));
  });

  it('no connection: friendly message and retry', async () => {
    const today = vi.fn().mockRejectedValueOnce(new TypeError('fetch')).mockResolvedValue({ today: 'x', items, doneToday: false });
    setup({ today });
    await screen.findByText('No encuentro tu repaso ahora. ¡Díselo a papá!');
    await act(async () => click('Intentar de nuevo'));
    expect(screen.getByText('Pregunta 1 de 2')).toBeTruthy();
  });

  it('a second review the same day finishes without promising a star', async () => {
    setup({ finish: vi.fn(async () => ({ starGained: false, starsThisWeek: 3 })), today: vi.fn(async () => ({ today: 'x', items: [items[0]], doneToday: true })) });
    await screen.findByText('Pregunta 1 de 1');
    click(/Verdadero/);
    await act(async () => click('Terminar'));
    expect(screen.queryByText(/Ganaste una estrella/)).toBeNull();
  });

  it('if saving an answer fails, the review goes on (it is retried next time)', async () => {
    const { api } = setup({ answer: vi.fn(async () => Promise.reject(new Error('500'))) });
    await screen.findByText('Pregunta 1 de 2');
    click(/Verdadero/);
    expect(api.answer).toHaveBeenCalled();
    click('Siguiente');
    expect(await screen.findByText('Pregunta 2 de 2')).toBeTruthy();
  });
});

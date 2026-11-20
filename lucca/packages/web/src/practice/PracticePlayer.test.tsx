// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { bi, type PracticeItem } from '@lucca/shared';
import { task } from '../testFixtures';
import type { Speaker } from '../speaker';
import type { PracticeAnswer } from './api';
import { PracticePlayer } from './PracticePlayer';

afterEach(cleanup);

/** Retos de verdadero/falso cuya respuesta es «Verdadero», con el nivel en el texto. */
const tf = (id: string, level: 1 | 2 | 3): PracticeItem => ({ id, level, block: { type: 'trueFalse', statement: bi(`Nivel ${level}: ${id}.`, `Level ${level}: ${id}.`), answer: true } });
const bank = [1, 2, 3].flatMap((l) => Array.from({ length: 6 }, (_, i) => tf(`n${l}-${i}`, l as 1 | 2 | 3)));
const ready = (items = bank): PracticeAnswer => ({ status: 'ready', source: 'math', items });

function setup(load: () => Promise<PracticeAnswer> = async () => ready(), stars = 1) {
  const speaker = { available: () => true, speak: vi.fn(), stop: vi.fn(), speaking: false } as unknown as Speaker;
  const onProgress = vi.fn(async () => ({ ok: true as const, starsGained: stars }));
  const onClose = vi.fn();
  render(<PracticePlayer task={task({ id: 'sub', subject: 'math', title: 'Restas' })} lang="es" voiceMode="text" speaker={speaker} load={load} onProgress={onProgress} onClose={onClose} />);
  return { onProgress, onClose };
}
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const right = () => click(/Verdadero/);
const wrongThenRight = () => {
  click(/Falso/);
  click(/Verdadero/);
};
const level = () => screen.getByText(/^Nivel \d de 3$/).textContent;

describe('PracticePlayer', () => {
  it('starts at level 1 and two first-try answers go up a level', async () => {
    setup();
    await screen.findByText('Reto 1 de 6');
    expect(level()).toBe('Nivel 1 de 3');
    expect(screen.getByText(/^Nivel 1:/)).toBeTruthy();
    right();
    click('Siguiente');
    right();
    expect(screen.getByText('¡Subes de nivel!')).toBeTruthy();
    click('Siguiente');
    expect(level()).toBe('Nivel 2 de 3');
    expect(screen.getByText(/^Nivel 2:/)).toBeTruthy();
  });

  it('two misses go down a level and say "Vamos con uno más fácil"', async () => {
    setup();
    await screen.findByText('Reto 1 de 6');
    right();
    click('Siguiente');
    right();
    click('Siguiente');
    wrongThenRight();
    click('Siguiente');
    wrongThenRight();
    expect(screen.getByText('Vamos con uno más fácil.')).toBeTruthy();
    click('Siguiente');
    expect(level()).toBe('Nivel 1 de 3');
  });

  it('a miss never blocks: he can try again and go on', async () => {
    setup();
    await screen.findByText('Reto 1 de 6');
    expect((screen.getByRole('button', { name: 'Siguiente' }) as HTMLButtonElement).disabled).toBe(true);
    wrongThenRight();
    expect((screen.getByRole('button', { name: 'Siguiente' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('after 6 challenges: summary with first tries, star, "Otra ronda" restarts', async () => {
    const { onProgress } = setup();
    await screen.findByText('Reto 1 de 6');
    for (let i = 0; i < 6; i++) {
      if (i === 2) wrongThenRight();
      else right();
      await act(async () => click(i === 5 ? 'Terminar' : 'Siguiente'));
    }
    expect(screen.getByRole('heading', { name: '¡Práctica terminada!' })).toBeTruthy();
    expect(screen.getByText('Hiciste 6 retos. 5 a la primera.')).toBeTruthy();
    expect(screen.getByText(/Ganaste una estrella/)).toBeTruthy();
    expect(onProgress).toHaveBeenCalledWith('sub', 'practice_done');
    click('Otra ronda');
    expect(screen.getByText('Reto 1 de 6')).toBeTruthy();
    expect(level()).toBe('Nivel 1 de 3');
  });

  it('never repeats a challenge within a round while there are fresh ones', async () => {
    setup();
    await screen.findByText('Reto 1 de 6');
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      seen.push(screen.getByText(/^Nivel \d: /).textContent!);
      right();
      await act(async () => click(i === 5 ? 'Terminar' : 'Siguiente'));
    }
    expect(new Set(seen).size).toBe(6);
  });

  it('a tiny bank still makes a full round (repeating) without breaking', async () => {
    setup(async () => ready([tf('only', 1)]));
    await screen.findByText('Reto 1 de 6');
    for (let i = 0; i < 6; i++) {
      right();
      await act(async () => click(i === 5 ? 'Terminar' : 'Siguiente'));
    }
    expect(screen.getByRole('heading', { name: '¡Práctica terminada!' })).toBeTruthy();
  });

  it.each([
    [async () => ({ status: 'unavailable', reason: 'no-ai' }) as PracticeAnswer, 'Esta tarea la vemos con papá.'],
    [async () => ready([]), 'Esta tarea la vemos con papá.'],
    [async () => Promise.reject(new TypeError('fetch')), 'No encuentro tu lección ahora. ¡Díselo a papá!'],
  ])('unavailable cases say it kindly (%#)', async (load, message) => {
    setup(load as () => Promise<PracticeAnswer>);
    expect((await screen.findByRole('status')).textContent).toBe(message);
  });

  it('a second round the same day does not promise another star', async () => {
    setup(undefined, 0);
    await screen.findByText('Reto 1 de 6');
    for (let i = 0; i < 6; i++) {
      right();
      await act(async () => click(i === 5 ? 'Terminar' : 'Siguiente'));
    }
    expect(screen.queryByText(/Ganaste una estrella/)).toBeNull();
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { bi, type Block } from '@lucca/shared';
import { LessonBlock, countChoices } from './Blocks';
import { shuffled } from './text';

afterEach(cleanup);
const draw = (block: Block, lang: 'es' | 'en' = 'es') => {
  const onSolved = vi.fn();
  const onMiss = vi.fn();
  render(<LessonBlock block={block} lang={lang} onSolved={onSolved} onMiss={onMiss} />);
  return { onSolved, onMiss };
};
const tap = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const status = () => screen.getByRole('status').textContent;

describe('explain and story', () => {
  it('shows the text in the chosen language, with words of the other language marked', () => {
    draw({ type: 'explain', text: { es: [{ text: 'La palabra ' }, { text: 'cat', lang: 'en' }, { text: ' es gato.' }], en: [{ text: 'Cat.' }] }, emoji: '🐱' });
    expect(screen.getByText('cat').getAttribute('lang')).toBe('en');
    expect(document.body.textContent).toContain('La palabra cat es gato.');
  });
  it('a story shows its panels in order', () => {
    draw({ type: 'story', panels: [{ text: bi('Uno.', 'One.'), emoji: '1️⃣' }, { text: bi('Dos.', 'Two.'), emoji: '2️⃣' }] }, 'en');
    expect(screen.getAllByRole('listitem').map((li) => li.querySelector('p')!.textContent)).toEqual(['One.', 'Two.']);
  });
});

describe('choice', () => {
  const block: Block = { type: 'choice', question: bi('¿Qué bebe agua?', 'What drinks water?'), options: [{ text: bi('La raíz', 'The root') }, { text: bi('La flor', 'The flower') }], correct: 0 };
  it('a wrong answer says "try again", turns that option off and can be retried', () => {
    const { onSolved, onMiss } = draw(block);
    tap('La flor');
    expect(status()).toBe('Casi. Inténtalo otra vez.');
    expect((screen.getByRole('button', { name: 'La flor' }) as HTMLButtonElement).disabled).toBe(true);
    expect(onMiss).toHaveBeenCalledTimes(1);
    tap('La raíz');
    expect(status()).toBe('¡Muy bien!');
    expect(onSolved).toHaveBeenCalledTimes(1);
  });
  it('tapping the same wrong option twice counts once', () => {
    const { onMiss } = draw(block);
    tap('La flor');
    fireEvent.click(screen.getByRole('button', { name: 'La flor' }));
    expect(onMiss).toHaveBeenCalledTimes(1);
  });
});

describe('trueFalse, fillWord and count', () => {
  it('true/false in English', () => {
    const { onSolved } = draw({ type: 'trueFalse', statement: bi('Las hojas comen sol.', 'Leaves eat sunlight.'), answer: true }, 'en');
    tap('👎 False'.replace('👎 ', ''));
    expect(status()).toBe('Almost. Try again.');
    fireEvent.click(screen.getByRole('button', { name: /True/ }));
    expect(onSolved).toHaveBeenCalled();
  });
  it('fill the word', () => {
    const { onSolved } = draw({ type: 'fillWord', sentence: bi('La flor hace ___.', 'The flower makes ___.'), options: [bi('piedras', 'stones'), bi('semillas', 'seeds')], correct: 1 });
    tap('semillas');
    expect(onSolved).toHaveBeenCalled();
  });
  it('count shows the pictures and three numbers around the answer', () => {
    const { onSolved } = draw({ type: 'count', question: bi('¿Cuántas hojas?', 'How many leaves?'), emoji: '🍃', amount: 4 });
    expect(screen.getAllByRole('img', { name: '🍃' })).toHaveLength(4);
    expect(['3', '4', '5'].every((n) => screen.getByRole('button', { name: n }))).toBe(true);
    tap('4');
    expect(onSolved).toHaveBeenCalled();
  });
  it('countChoices never goes below 1', () => {
    expect(countChoices(1)).toEqual([1, 2, 3]);
    expect(countChoices(20)).toEqual([19, 20, 21]);
  });
});

describe('numberLine', () => {
  it('shows every number in range and accepts the right one', () => {
    const { onSolved, onMiss } = draw({ type: 'numberLine', question: bi('9 menos 4', '9 minus 4'), min: 0, max: 10, answer: 5 });
    expect(screen.getAllByRole('button')).toHaveLength(11);
    tap('6');
    expect(onMiss).toHaveBeenCalled();
    tap('5');
    expect(onSolved).toHaveBeenCalled();
  });
});

describe('order', () => {
  const block: Block = { type: 'order', question: bi('Ordena.', 'Order.'), items: [bi('Raíz', 'Root'), bi('Tallo', 'Stem'), bi('Flor', 'Flower')] };
  it('items come mixed; tapping out of order is a miss, the right order solves it', () => {
    const { onSolved, onMiss } = draw(block);
    const shown = screen.getAllByRole('button').map((b) => b.textContent);
    expect(shown).not.toEqual(['Raíz', 'Tallo', 'Flor']);
    tap('Flor');
    expect(onMiss).toHaveBeenCalledTimes(1);
    tap('Raíz');
    tap('Tallo');
    tap('Flor');
    expect(onSolved).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('list', { name: 'Tu orden' }).textContent).toBe('RaízTalloFlor');
  });
});

describe('match', () => {
  it('pick left then right; a wrong pair is a miss; all pairs solve it', () => {
    const { onSolved, onMiss } = draw({ type: 'match', question: bi('Une.', 'Match.'), pairs: [{ left: bi('Raíz', 'Root'), right: bi('Bebe agua', 'Drinks') }, { left: bi('Hoja', 'Leaf'), right: bi('Toma sol', 'Sun') }] });
    expect((screen.getByRole('button', { name: 'Bebe agua' }) as HTMLButtonElement).disabled).toBe(true);
    tap('Raíz');
    expect(screen.getByRole('button', { name: 'Raíz' }).getAttribute('aria-pressed')).toBe('true');
    tap('Toma sol');
    expect(onMiss).toHaveBeenCalledTimes(1);
    tap('Raíz');
    tap('Bebe agua');
    tap('Hoja');
    tap('Toma sol');
    expect(onSolved).toHaveBeenCalledTimes(1);
  });
});

describe('sort', () => {
  it('one item at a time into its group', () => {
    const { onSolved, onMiss } = draw({ type: 'sort', question: bi('¿Agua o tierra?', 'Water or land?'), groups: [bi('Agua', 'Water'), bi('Tierra', 'Land')], items: [{ text: bi('Pez', 'Fish'), group: 0 }, { text: bi('Perro', 'Dog'), group: 1 }] });
    expect(screen.getByText('Ahora: Pez')).toBeTruthy();
    tap('Tierra');
    expect(onMiss).toHaveBeenCalled();
    tap('Agua');
    expect(screen.getByText('Ahora: Perro')).toBeTruthy();
    tap('Tierra');
    expect(onSolved).toHaveBeenCalled();
    expect(status()).toBe('¡Muy bien!');
  });
});

describe('shuffled', () => {
  it('is stable for the same seed and never keeps the original order', () => {
    expect(shuffled([1, 2, 3, 4], 'x')).toEqual(shuffled([1, 2, 3, 4], 'x'));
    for (const seed of ['a', 'b', 'c', 'd', 'e']) expect(shuffled([1, 2], seed)).toEqual([2, 1]);
    expect(shuffled([1], 'a')).toEqual([1]);
  });
});

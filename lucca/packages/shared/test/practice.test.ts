import { describe, expect, it } from 'vitest';
import { bi, type LessonDoc } from '../src/lesson';
import { START, adapt, checkPracticeBlock, lessonBank, levelOf, mathBank, mathKind, pickItem, type PracticeItem } from '../src/practice';

describe('adapt (2 aciertos suben, 2 fallos bajan)', () => {
  it('starts easy', () => expect(START).toEqual({ level: 1, right: 0, wrong: 0 }));
  it('two right in a row go up one level and restart the count', () => {
    let s = adapt(START, true);
    expect(s).toEqual({ level: 1, right: 1, wrong: 0 });
    s = adapt(s, true);
    expect(s).toEqual({ level: 2, right: 0, wrong: 0 });
  });
  it('two wrong in a row go down one level', () => {
    const s = adapt(adapt({ level: 3, right: 0, wrong: 0 }, false), false);
    expect(s).toEqual({ level: 2, right: 0, wrong: 0 });
  });
  it('right then wrong resets both streaks', () => {
    expect(adapt(adapt(START, true), false)).toEqual({ level: 1, right: 0, wrong: 1 });
  });
  it('never goes above 3 or below 1', () => {
    expect(adapt({ level: 3, right: 1, wrong: 0 }, true).level).toBe(3);
    expect(adapt({ level: 1, right: 0, wrong: 1 }, false).level).toBe(1);
  });
});

describe('mathKind', () => {
  it.each([
    ['Sumas con llevadas, pág. 24', 'add'],
    ['Restas sin llevar, pág. 26', 'sub'],
    ['Addition practice', 'add'],
    ['Subtraction to 20', 'sub'],
    ['Las partes de la planta', null],
    ['Problemas con monedas', null],
  ])('%s → %s', (title, kind) => expect(mathKind(title, '')).toBe(kind));
});

describe('mathBank', () => {
  for (const kind of ['add', 'sub'] as const) {
    it(`${kind}: 30 items, 10 per level, all valid, all answers right`, () => {
      const bank = mathBank(kind, 'seed-1', false);
      expect(bank).toHaveLength(30);
      for (const level of [1, 2, 3]) expect(bank.filter((i) => i.level === level)).toHaveLength(10);
      for (const item of bank) expect(checkPracticeBlock(item.block)).toEqual([]);
      expect(new Set(bank.map((i) => i.id)).size).toBe(30);
    });
  }
  it('is stable for the same seed and changes with another one', () => {
    expect(mathBank('add', 'a', false)).toEqual(mathBank('add', 'a', false));
    expect(JSON.stringify(mathBank('add', 'a', false))).not.toBe(JSON.stringify(mathBank('add', 'b', false)));
  });
  it('the correct choice really is the sum or difference', () => {
    for (const item of [...mathBank('add', 'x', false), ...mathBank('sub', 'x', false)]) {
      const b = item.block;
      const text = b.type === 'choice' ? b.question.es[0].text : b.type === 'trueFalse' ? b.statement.es[0].text : b.type === 'numberLine' ? b.question.es[0].text : '';
      const m = text.match(/(\d+) (más|menos) (\d+)/);
      if (!m) continue;
      const value = m[2] === 'más' ? Number(m[1]) + Number(m[3]) : Number(m[1]) - Number(m[3]);
      if (b.type === 'choice') expect(Number(b.options[b.correct].text.es[0].text)).toBe(value);
      if (b.type === 'numberLine') expect(b.answer).toBe(value);
      if (b.type === 'trueFalse') expect(b.answer).toBe(Number(text.match(/= (\d+)/)![1]) === value);
    }
  });
  it('subtraction "sin llevar" never needs borrowing and never goes below zero', () => {
    for (const item of mathBank('sub', 'z', true)) {
      const b = item.block;
      const text = b.type === 'choice' ? b.question.es[0].text : b.type === 'trueFalse' ? b.statement.es[0].text : b.type === 'numberLine' ? b.question.es[0].text : '';
      const m = text.match(/(\d+) menos (\d+)/);
      if (!m) continue;
      const [a, c] = [Number(m[1]), Number(m[2])];
      expect(a - c).toBeGreaterThanOrEqual(0);
      expect(a % 10).toBeGreaterThanOrEqual(c % 10);
    }
  });
  it('level 3 addition carries', () => {
    const carries = mathBank('add', 'q', false)
      .filter((i) => i.level === 3 && i.block.type === 'choice')
      .map((i) => (i.block.type === 'choice' ? i.block.question.es[0].text.match(/(\d+) más (\d+)/)! : null)!)
      .every((m) => (Number(m[1]) % 10) + (Number(m[2]) % 10) >= 10);
    expect(carries).toBe(true);
  });
});

describe('lessonBank', () => {
  const doc: LessonDoc = {
    title: bi('Planta', 'Plant'),
    screens: [
      { blocks: [{ type: 'explain', text: bi('Hola.', 'Hi.') }] },
      { blocks: [{ type: 'count', question: bi('¿Cuántas?', 'How many?'), emoji: '🍃', amount: 3 }] },
      { blocks: [{ type: 'order', question: bi('Ordena.', 'Order.'), items: [bi('A', 'A'), bi('B', 'B'), bi('C', 'C')] }] },
      { blocks: [{ type: 'story', panels: [{ text: bi('Uno.', 'One.'), emoji: '1️⃣' }, { text: bi('Dos.', 'Two.'), emoji: '2️⃣' }] }] },
    ],
    quiz: [
      { type: 'trueFalse', statement: bi('Sí.', 'Yes.'), answer: true },
      { type: 'choice', question: bi('¿Cuál?', 'Which?'), options: [{ text: bi('A', 'A') }, { text: bi('B', 'B') }], correct: 0 },
    ],
  };
  it('keeps only the interactive blocks, with a level each, and no explanations', () => {
    const bank = lessonBank([doc]);
    expect(bank.map((i) => i.block.type).sort()).toEqual(['choice', 'count', 'order', 'trueFalse']);
    expect(bank.every((i) => [1, 2, 3].includes(i.level))).toBe(true);
  });
  it('several lessons add up, without repeated ids', () => {
    const bank = lessonBank([doc, doc]);
    expect(bank).toHaveLength(8);
    expect(new Set(bank.map((i) => i.id)).size).toBe(8);
  });
  it('levels by kind of game', () => {
    expect(levelOf({ type: 'trueFalse', statement: bi('a', 'a'), answer: true })).toBe(1);
    expect(levelOf({ type: 'choice', question: bi('a', 'a'), options: [], correct: 0 })).toBe(2);
    expect(levelOf({ type: 'order', question: bi('a', 'a'), items: [] })).toBe(3);
  });
});

describe('pickItem', () => {
  const it_ = (id: string, level: 1 | 2 | 3, type: 'choice' | 'trueFalse' = 'choice'): PracticeItem => ({
    id,
    level,
    block: type === 'choice' ? { type: 'choice', question: bi(id, id), options: [{ text: bi('a', 'a') }, { text: bi('b', 'b') }], correct: 0 } : { type: 'trueFalse', statement: bi(id, id), answer: true },
  });
  it('takes an unused item of the level, avoiding the same game twice in a row', () => {
    const bank = [it_('a', 1, 'choice'), it_('b', 1, 'trueFalse'), it_('c', 2)];
    expect(pickItem(bank, 1, new Set(), 'choice')?.id).toBe('b');
    expect(pickItem(bank, 1, new Set(['b']), 'choice')?.id).toBe('a');
  });
  it('falls back to the nearest level, and repeats only when everything was used', () => {
    const bank = [it_('a', 1), it_('c', 3)];
    expect(pickItem(bank, 2, new Set())?.level).toBe(1);
    expect(pickItem(bank, 3, new Set(['c']))?.id).toBe('a');
    expect(pickItem(bank, 1, new Set(['a', 'c']))).not.toBeNull();
  });
  it('an empty bank gives nothing', () => {
    expect(pickItem([], 1, new Set())).toBeNull();
  });
});

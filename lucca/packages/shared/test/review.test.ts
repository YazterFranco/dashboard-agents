import { describe, expect, it } from 'vitest';
import { LEARNED_BOX, nextReview, pickDue, type ReviewItem } from '../src/review';

describe('nextReview (cajas de Leitner: 1, 3 y 7 días)', () => {
  it.each([
    [1, true, 2, '2026-11-21'],
    [2, true, 3, '2026-11-25'],
    [3, true, 4, '2026-12-02'],
    [4, true, 4, '2026-12-02'],
  ])('box %i correct → box %i, next on %s', (box, correct, nextBox, due) => {
    expect(nextReview(box, correct, '2026-11-18')).toEqual({ box: nextBox, dueDate: due });
  });
  it('a miss always goes back to box 1, tomorrow', () => {
    for (const box of [1, 2, 3, 4]) expect(nextReview(box, false, '2026-11-18')).toEqual({ box: 1, dueDate: '2026-11-19' });
  });
  it('box 4 means learned', () => {
    expect(LEARNED_BOX).toBe(4);
  });
  it('crosses months and years', () => {
    expect(nextReview(3, true, '2026-12-28').dueDate).toBe('2027-01-11');
  });
});

describe('pickDue', () => {
  const item = (id: string, dueDate: string, box = 1): ReviewItem => ({ id, dueDate, box });
  it('only what is due today or earlier, oldest first, lower boxes first on ties', () => {
    const items = [item('a', '2026-11-19'), item('b', '2026-11-17', 2), item('c', '2026-11-18', 3), item('d', '2026-11-18', 1), item('e', '2026-11-25')];
    expect(pickDue(items, '2026-11-18').map((i) => i.id)).toEqual(['b', 'd', 'c']);
  });
  it('at most 5 per day', () => {
    const items = Array.from({ length: 9 }, (_, i) => item(`i${i}`, '2026-11-10'));
    expect(pickDue(items, '2026-11-18')).toHaveLength(5);
  });
  it('learned items come back only on their date', () => {
    expect(pickDue([item('x', '2026-12-02', 4)], '2026-11-30')).toEqual([]);
  });
  it('nothing due: empty', () => {
    expect(pickDue([], '2026-11-18')).toEqual([]);
  });
});

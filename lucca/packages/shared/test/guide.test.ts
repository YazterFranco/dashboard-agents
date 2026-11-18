import { describe, expect, it } from 'vitest';
import {
  TaskSchema,
  defaultDayOf,
  guideOrder,
  shiftWeek,
  suggestedStart,
  weekTotals,
  type DaySummary,
  type DayTask,
  type Task,
} from '../src/index.js';

const WEEK = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'];
const summaries = (pending: number[], total: number[] = pending): DaySummary[] =>
  WEEK.map((date, i) => ({ date, total: total[i], pending: pending[i], allDone: total[i] > 0 && pending[i] === 0 }));

function task(p: Partial<Task> & { id: string }): Task {
  return TaskSchema.parse({ subject: 'math', title: `Tarea ${p.id}`, source: 'manual', ...p });
}
const item = (t: Task, urgent = false): DayTask => ({ task: t, dueDate: t.dueDate, urgent });

describe('shiftWeek', () => {
  it('moves whole weeks and always returns a Monday', () => {
    expect(shiftWeek('2026-11-16', 1)).toBe('2026-11-23');
    expect(shiftWeek('2026-11-18', -1)).toBe('2026-11-09');
    expect(shiftWeek('2026-11-18', 0)).toBe('2026-11-16');
  });
  it('crosses the year', () => {
    expect(shiftWeek('2026-12-28', 1)).toBe('2027-01-04');
    expect(shiftWeek('2027-01-04', -1)).toBe('2026-12-28');
  });
});

describe('weekTotals', () => {
  it('adds up the days', () => {
    expect(weekTotals(summaries([0, 1, 0, 1, 0], [2, 3, 0, 0, 0]))).toEqual({ total: 5, done: 3, pending: 2 });
  });
  it('is all zeros for an empty week', () => {
    expect(weekTotals(summaries([0, 0, 0, 0, 0]))).toEqual({ total: 0, done: 0, pending: 0 });
  });
});

describe('guideOrder', () => {
  it('puts the started task first, then urgent ones, then by subject', () => {
    const items = [
      item(task({ id: 'math', subject: 'math' })),
      item(task({ id: 'span', subject: 'spanish' }), true),
      item(task({ id: 'sci', subject: 'science', status: 'doing' })),
    ];
    expect(guideOrder(items).map((i) => i.task.id)).toEqual(['sci', 'span', 'math']);
  });
  it('leaves finished tasks out', () => {
    const items = [item(task({ id: 'a', status: 'done' })), item(task({ id: 'b' }))];
    expect(guideOrder(items).map((i) => i.task.id)).toEqual(['b']);
  });
  it('is stable by title inside a subject', () => {
    const items = [item(task({ id: 'z', title: 'Zeta' })), item(task({ id: 'a', title: 'Alfa' }))];
    expect(guideOrder(items).map((i) => i.task.id)).toEqual(['a', 'z']);
  });
  it('does not change the input', () => {
    const items = [item(task({ id: 'b', subject: 'science' })), item(task({ id: 'a', subject: 'math' }))];
    guideOrder(items);
    expect(items.map((i) => i.task.id)).toEqual(['b', 'a']);
  });
});

describe('suggestedStart', () => {
  it('prefers today when it has pending tasks', () => {
    expect(suggestedStart(summaries([0, 2, 1, 0, 0]), '2026-11-17')).toBe('2026-11-17');
  });
  it('skips a finished today to the next day with pending tasks', () => {
    expect(suggestedStart(summaries([0, 0, 1, 0, 2], [1, 2, 1, 0, 2]), '2026-11-17')).toBe('2026-11-18');
  });
  it('falls back to an earlier day when only that one is pending', () => {
    expect(suggestedStart(summaries([1, 0, 0, 0, 0]), '2026-11-18')).toBe('2026-11-16');
  });
  it('uses the first pending day when today is outside the week', () => {
    expect(suggestedStart(summaries([0, 0, 1, 0, 1]), '2026-11-02')).toBe('2026-11-18');
  });
  it('returns null when nothing is pending', () => {
    expect(suggestedStart(summaries([0, 0, 0, 0, 0], [2, 0, 1, 0, 0]), '2026-11-17')).toBeNull();
  });
});

describe('defaultDayOf', () => {
  it('selects today in the current week', () => {
    expect(defaultDayOf('2026-11-16', [], '2026-11-17')).toBe('2026-11-17');
  });
  it('selects the first day with pending tasks in another week', () => {
    const tasks = [task({ id: 'thu', assignedDate: '2026-11-26', dueDate: '2026-11-27' })];
    expect(defaultDayOf('2026-11-23', tasks, '2026-11-17')).toBe('2026-11-26');
  });
  it('selects Monday when the week has no tasks', () => {
    expect(defaultDayOf('2026-11-23', [], '2026-11-17')).toBe('2026-11-23');
  });
  it('selects Monday in a past week with everything finished', () => {
    const tasks = [task({ id: 'a', assignedDate: '2026-11-10', dueDate: '2026-11-11', status: 'done' })];
    expect(defaultDayOf('2026-11-09', tasks, '2026-11-17')).toBe('2026-11-09');
  });
});

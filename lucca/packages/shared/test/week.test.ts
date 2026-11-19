import { describe, expect, it } from 'vitest';
import {
  TaskSchema,
  addDays,
  dayTasks,
  localDate,
  mondayOf,
  plannerToday,
  previousSchoolDay,
  weekDays,
  weekSummary,
  weekdayOf,
  workDateOf,
  type Task,
} from '../src/index.js';

function task(partial: Partial<Task> & { id: string }): Task {
  return TaskSchema.parse({ subject: 'math', title: `Tarea ${partial.id}`, source: 'manual', ...partial });
}

describe('dates', () => {
  it('localDate converts near midnight', () => {
    expect(localDate(new Date('2026-11-18T03:00:00Z'), 'America/Panama')).toBe('2026-11-17');
    expect(localDate(new Date('2026-11-18T05:00:00Z'), 'America/Panama')).toBe('2026-11-18');
  });

  it('weekdayOf, addDays and mondayOf', () => {
    expect(weekdayOf('2026-11-17')).toBe(2);
    expect(weekdayOf('2026-11-22')).toBe(0);
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-11-17', -17)).toBe('2026-10-31');
    expect(mondayOf('2026-11-22')).toBe('2026-11-16');
    expect(mondayOf('2026-11-23')).toBe('2026-11-23');
  });

  it('plannerToday on weekends moves to the next Monday', () => {
    expect(plannerToday('2026-11-21')).toBe('2026-11-23');
    expect(plannerToday('2026-11-22')).toBe('2026-11-23');
    expect(plannerToday('2026-11-17')).toBe('2026-11-17');
  });

  it('weekDays lists Monday to Friday', () => {
    expect(weekDays('2026-11-17')).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']);
  });

  it('previousSchoolDay skips weekends', () => {
    expect(previousSchoolDay('2026-11-23')).toBe('2026-11-20');
    expect(previousSchoolDay('2026-11-18')).toBe('2026-11-17');
  });
});

describe('workDateOf', () => {
  it('uses the school day before the due date', () => {
    expect(workDateOf({ assignedDate: null, dueDate: '2026-11-18' }, '2026-11-17')).toBe('2026-11-17');
  });
  it('prefers the assigned date', () => {
    expect(workDateOf({ assignedDate: '2026-11-16', dueDate: '2026-11-18' }, '2026-11-17')).toBe('2026-11-16');
  });
  it('falls back to today without dates', () => {
    expect(workDateOf({ assignedDate: null, dueDate: null }, '2026-11-17')).toBe('2026-11-17');
  });
});

describe('dayTasks', () => {
  it('puts a due-Wednesday task on Tuesday keeping its due date', () => {
    const items = dayTasks([task({ id: 'a', dueDate: '2026-11-18' })], '2026-11-17', '2026-11-17');
    expect(items).toHaveLength(1);
    expect(items[0].dueDate).toBe('2026-11-18');
    expect(items[0].urgent).toBe(false);
  });

  it('does not show a task on other days', () => {
    expect(dayTasks([task({ id: 'a', dueDate: '2026-11-18' })], '2026-11-18', '2026-11-17')).toEqual([]);
  });

  it('moves an overdue unfinished task to today as urgent', () => {
    const t = task({ id: 'a', assignedDate: '2026-11-13', dueDate: '2026-11-16' });
    const today = dayTasks([t], '2026-11-17', '2026-11-17');
    expect(today).toHaveLength(1);
    expect(today[0].urgent).toBe(true);
    expect(dayTasks([t], '2026-11-13', '2026-11-17')).toEqual([]);
  });

  it('leaves a finished overdue task on its work date', () => {
    const t = task({ id: 'a', assignedDate: '2026-11-13', dueDate: '2026-11-16', status: 'done' });
    expect(dayTasks([t], '2026-11-17', '2026-11-17')).toEqual([]);
    expect(dayTasks([t], '2026-11-13', '2026-11-17')).toHaveLength(1);
  });

  it('carries an unfinished task from an earlier day to today without marking it urgent', () => {
    const withDue = task({ id: 'a', assignedDate: '2026-11-10', dueDate: '2026-11-20' });
    const noDue = task({ id: 'b', assignedDate: '2026-11-10' });
    for (const t of [withDue, noDue]) {
      const today = dayTasks([t], '2026-11-17', '2026-11-17');
      expect(today).toHaveLength(1);
      expect(today[0].urgent).toBe(false);
      expect(dayTasks([t], '2026-11-10', '2026-11-17')).toEqual([]);
    }
  });

  it('keeps a finished task from an earlier day on its own day', () => {
    const t = task({ id: 'a', assignedDate: '2026-11-10', dueDate: '2026-11-20', status: 'done' });
    expect(dayTasks([t], '2026-11-10', '2026-11-17')).toHaveLength(1);
    expect(dayTasks([t], '2026-11-17', '2026-11-17')).toEqual([]);
  });

  it('weekend rollover: a task due on Monday shows on Monday as urgent', () => {
    const today = plannerToday('2026-11-22');
    expect(today).toBe('2026-11-23');
    const items = dayTasks([task({ id: 'a', dueDate: '2026-11-23' })], '2026-11-23', today);
    expect(items).toHaveLength(1);
    expect(items[0].urgent).toBe(true);
  });

  it('hides hidden and retired tasks', () => {
    const tasks = [task({ id: 'a', hidden: true }), task({ id: 'b', retired: true }), task({ id: 'c' })];
    expect(dayTasks(tasks, '2026-11-17', '2026-11-17').map((i) => i.task.id)).toEqual(['c']);
  });

  it('orders by subject and then by title', () => {
    const tasks = [
      task({ id: 'a', subject: 'science', title: 'B' }),
      task({ id: 'b', subject: 'math', title: 'Z' }),
      task({ id: 'c', subject: 'math', title: 'A' }),
    ];
    expect(dayTasks(tasks, '2026-11-17', '2026-11-17').map((i) => i.task.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('weekSummary', () => {
  it('counts a carried-over task in the week of today and not in the past week', () => {
    const tasks = [task({ id: 'a', assignedDate: '2026-11-10', dueDate: '2026-11-27' })];
    expect(weekSummary(tasks, weekDays('2026-11-10'), '2026-11-17').every((d) => d.total === 0)).toBe(true);
    const thisWeek = weekSummary(tasks, weekDays('2026-11-17'), '2026-11-17');
    expect(thisWeek.find((d) => d.date === '2026-11-17')).toEqual({ date: '2026-11-17', total: 1, pending: 1, allDone: false });
  });

  it('counts total, pending and allDone per day', () => {
    const tasks = [
      task({ id: 'a', assignedDate: '2026-11-16', status: 'done' }),
      task({ id: 'b', assignedDate: '2026-11-16', status: 'done' }),
      task({ id: 'c', assignedDate: '2026-11-17' }),
      task({ id: 'd', assignedDate: '2026-11-17', status: 'done' }),
    ];
    const s = weekSummary(tasks, weekDays('2026-11-17'), '2026-11-17');
    expect(s[0]).toEqual({ date: '2026-11-16', total: 2, pending: 0, allDone: true });
    expect(s[1]).toEqual({ date: '2026-11-17', total: 2, pending: 1, allDone: false });
    expect(s[2]).toEqual({ date: '2026-11-18', total: 0, pending: 0, allDone: false });
  });
});

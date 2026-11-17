import { afterEach, describe, expect, it } from 'vitest';
import { dayTasks, weekDays } from '@lucca/shared';
import { LuccaDb } from '../src/db.js';
import { seedDemo } from '../src/seed.js';

describe('seedDemo', () => {
  let db: LuccaDb;
  afterEach(() => db?.close());

  it('seeds the week of the planner day', () => {
    db = new LuccaDb(':memory:');
    seedDemo(db, '2026-11-17');
    const tasks = db.listTasks();
    expect(tasks).toHaveLength(10);
    const perDay = weekDays('2026-11-17').map((d) => dayTasks(tasks, d, '2026-11-16').length);
    expect(perDay).toEqual([2, 3, 2, 2, 1]);
  });

  it('is idempotent', () => {
    db = new LuccaDb(':memory:');
    seedDemo(db, '2026-11-17');
    seedDemo(db, '2026-11-17');
    expect(db.listTasks()).toHaveLength(10);
  });

  it('does not overwrite progress when seeded again', () => {
    db = new LuccaDb(':memory:');
    seedDemo(db, '2026-11-17');
    const todo = db.listTasks().find((t) => t.status === 'todo')!;
    db.setTaskStatus(todo.id, 'done');
    seedDemo(db, '2026-11-17');
    expect(db.getTask(todo.id)!.status).toBe('done');
  });

  it('uses next week when today is a weekend', () => {
    db = new LuccaDb(':memory:');
    seedDemo(db, '2026-11-22');
    const dates = db.listTasks().map((t) => t.assignedDate!).sort();
    expect(dates[0]).toBe('2026-11-23');
    expect(dates.at(-1)).toBe('2026-11-27');
  });

  it('gives every task an english title and a next-school-day due date', () => {
    db = new LuccaDb(':memory:');
    seedDemo(db, '2026-11-17');
    for (const t of db.listTasks()) {
      expect(t.titleTranslations.en).toBeTruthy();
      expect(t.dueDate! > t.assignedDate!).toBe(true);
    }
    const friday = db.listTasks().find((t) => t.assignedDate === '2026-11-20')!;
    expect(friday.dueDate).toBe('2026-11-23');
  });
});

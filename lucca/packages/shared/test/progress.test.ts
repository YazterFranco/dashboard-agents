import { describe, expect, it } from 'vitest';
import { TaskSchema, needsHelp, nextStatus, starsForWeek, weeklyProgress, type ProgressEvent, type ProgressKind, type Task } from '../src/index.js';

let n = 0;
function ev(taskId: string, kind: ProgressKind, at = '2026-11-17T15:00:00Z'): ProgressEvent {
  return { id: `e${++n}`, taskId, kind, at };
}

const TZ = 'America/Panama';
const WEEK = '2026-11-16';

describe('starsForWeek', () => {
  it('gives one star per distinct task and kind', () => {
    const events = [ev('t1', 'lesson_done'), ev('t1', 'practice_done'), ev('t1', 'task_done')];
    expect(starsForWeek(events, WEEK, TZ)).toBe(3);
  });

  it('does not add stars for duplicated events', () => {
    expect(starsForWeek([ev('t1', 'task_done'), ev('t1', 'task_done')], WEEK, TZ)).toBe(1);
  });

  it('gives no stars for lesson_step, hint_used and help_requested', () => {
    const events = [ev('t1', 'lesson_step'), ev('t1', 'hint_used'), ev('t1', 'help_requested')];
    expect(starsForWeek(events, WEEK, TZ)).toBe(0);
  });

  it('uses the timezone for the Monday-Sunday boundary', () => {
    const sundayNight = ev('t1', 'task_done', '2026-11-23T04:30:00Z'); // domingo 23:30 en Panamá
    const mondayNight = ev('t2', 'task_done', '2026-11-23T05:30:00Z'); // lunes 00:30 en Panamá
    expect(starsForWeek([sundayNight, mondayNight], '2026-11-16', TZ)).toBe(1);
    expect(starsForWeek([sundayNight, mondayNight], '2026-11-23', TZ)).toBe(1);
  });

  it('never decreases when a hint is used afterwards', () => {
    const before = [ev('t1', 'task_done')];
    const after = [...before, ev('t1', 'hint_used', '2026-11-17T16:00:00Z')];
    expect(starsForWeek(after, WEEK, TZ)).toBeGreaterThanOrEqual(starsForWeek(before, WEEK, TZ));
  });

  it('ignores events with an invalid timestamp', () => {
    expect(starsForWeek([ev('t1', 'task_done', 'not-a-date')], WEEK, TZ)).toBe(0);
  });
});

describe('nextStatus', () => {
  it('moves todo to doing on activity', () => {
    for (const kind of ['lesson_step', 'lesson_done', 'practice_done', 'hint_used'] as const) {
      expect(nextStatus('todo', kind)).toBe('doing');
    }
  });
  it('task_done always ends in done', () => {
    expect(nextStatus('todo', 'task_done')).toBe('done');
    expect(nextStatus('doing', 'task_done')).toBe('done');
  });
  it('never moves back from done', () => {
    expect(nextStatus('done', 'lesson_step')).toBe('done');
  });
  it('asking for help alone does not start the task', () => {
    expect(nextStatus('todo', 'help_requested')).toBe('todo');
  });
});

function task(p: Partial<Task> & { id: string }): Task {
  return TaskSchema.parse({ subject: 'math', title: `Tarea ${p.id}`, source: 'manual', ...p });
}

describe('weeklyProgress', () => {
  const tasks = [
    task({ id: 'a', assignedDate: '2026-11-16', status: 'done' }),
    task({ id: 'b', assignedDate: '2026-11-17' }),
    task({ id: 'c', assignedDate: '2026-11-18', hidden: true }),
  ];
  const events = [
    ev('a', 'task_done', '2026-11-16T15:00:00Z'),
    ev('a', 'lesson_done', '2026-11-16T14:00:00Z'),
    ev('b', 'hint_used', '2026-11-17T15:00:00Z'),
    ev('b', 'hint_used', '2026-11-17T15:05:00Z'),
    ev('b', 'help_requested', '2026-11-17T15:10:00Z'),
  ];

  it('counts tasks, stars, hints and help requests of that week', () => {
    expect(weeklyProgress(tasks, events, '2026-11-16', '2026-11-18', TZ)).toEqual({
      weekStart: '2026-11-16',
      total: 2,
      done: 1,
      pending: 1,
      stars: 2,
      hints: 2,
      helpRequests: 1,
    });
  });

  it('leaves hidden tasks out of the totals', () => {
    expect(weeklyProgress(tasks, [], '2026-11-16', '2026-11-18', TZ).total).toBe(2);
  });

  it('is all zeros for a week without data', () => {
    expect(weeklyProgress(tasks, events, '2026-11-02', '2026-11-18', TZ)).toEqual({
      weekStart: '2026-11-02',
      total: 0,
      done: 0,
      pending: 0,
      stars: 0,
      hints: 0,
      helpRequests: 0,
    });
  });

  it('assigns an event of Sunday 23:30 in Panama to the week that ended', () => {
    const sunday = [ev('a', 'hint_used', '2026-11-23T04:30:00Z')];
    expect(weeklyProgress(tasks, sunday, '2026-11-16', '2026-11-18', TZ).hints).toBe(1);
    expect(weeklyProgress(tasks, sunday, '2026-11-23', '2026-11-25', TZ).hints).toBe(0);
  });

  it('ignores events with an invalid timestamp', () => {
    expect(weeklyProgress(tasks, [ev('a', 'hint_used', 'no-es-fecha')], '2026-11-16', '2026-11-18', TZ).hints).toBe(0);
  });
});

describe('needsHelp', () => {
  const tasks = [task({ id: 'a', title: 'Restas' }), task({ id: 'b', title: 'Lectura' })];

  it('lists tasks with help requests, the most asked first', () => {
    const events = [ev('a', 'help_requested'), ev('b', 'help_requested'), ev('b', 'help_requested')];
    expect(needsHelp(tasks, events, WEEK, TZ)).toEqual([
      { taskId: 'b', title: 'Lectura', count: 2 },
      { taskId: 'a', title: 'Restas', count: 1 },
    ]);
  });

  it('breaks ties by title', () => {
    const events = [ev('b', 'help_requested'), ev('a', 'help_requested')];
    expect(needsHelp(tasks, events, WEEK, TZ).map((n) => n.taskId)).toEqual(['b', 'a']);
  });

  it('ignores deleted tasks, other kinds of events and other weeks', () => {
    const events = [
      ev('gone', 'help_requested'),
      ev('a', 'hint_used'),
      ev('a', 'help_requested', '2026-11-03T15:00:00Z'),
    ];
    expect(needsHelp(tasks, events, WEEK, TZ)).toEqual([]);
  });

  it('is empty without events', () => {
    expect(needsHelp(tasks, [], WEEK, TZ)).toEqual([]);
  });
});

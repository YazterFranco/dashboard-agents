import { describe, expect, it } from 'vitest';
import { nextStatus, starsForWeek, type ProgressEvent, type ProgressKind } from '../src/index.js';

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

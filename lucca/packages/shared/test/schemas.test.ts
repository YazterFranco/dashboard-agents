import { describe, expect, it } from 'vitest';
import { IsoDateSchema, KidStateSchema, SettingsSchema, SUBJECTS, TaskSchema, taskTitle } from '../src/index.js';

const baseTask = { id: 't1', subject: 'science', title: 'Las partes de la planta', source: 'manual' } as const;

describe('schemas', () => {
  it('accepts a manual task with defaults', () => {
    const t = TaskSchema.parse(baseTask);
    expect(t.hidden).toBe(false);
    expect(t.retired).toBe(false);
    expect(t.titleTranslations).toEqual({});
    expect(t.status).toBe('todo');
    expect(t.assignedDate).toBeNull();
    expect(t.dueDate).toBeNull();
    expect(t.description).toBe('');
  });

  it('rejects an impossible date', () => {
    expect(IsoDateSchema.safeParse('2026-02-30').success).toBe(false);
    expect(IsoDateSchema.safeParse('17/11/2026').success).toBe(false);
    expect(IsoDateSchema.safeParse('2026-11-17').success).toBe(true);
  });

  it('rejects an unknown subject', () => {
    expect(TaskSchema.safeParse({ ...baseTask, subject: 'chemistry' }).success).toBe(false);
    expect(SUBJECTS).toContain('science');
  });

  it('taskTitle prefers the translation', () => {
    const t = TaskSchema.parse({ ...baseTask, titleTranslations: { en: 'The parts of a plant' } });
    expect(taskTitle(t, 'en')).toBe('The parts of a plant');
  });

  it('taskTitle falls back to the original title', () => {
    const t = TaskSchema.parse(baseTask);
    expect(taskTitle(t, 'en')).toBe('Las partes de la planta');
    expect(taskTitle(t, 'es')).toBe('Las partes de la planta');
  });

  it('settings defaults', () => {
    expect(SettingsSchema.parse({})).toEqual({
      childName: 'Lucca',
      lang: 'es',
      voiceMode: 'both',
      theme: 'dark',
      tz: 'America/Panama',
    });
  });

  it('KidState carries today, week start, settings, tasks and stars', () => {
    const s = KidStateSchema.parse({
      today: '2026-11-17',
      weekStart: '2026-11-16',
      settings: {},
      tasks: [baseTask],
      starsThisWeek: 2,
    });
    expect(s.tasks).toHaveLength(1);
    expect(s.starsThisWeek).toBe(2);
    expect(KidStateSchema.safeParse({ ...s, starsThisWeek: -1 }).success).toBe(false);
  });
});

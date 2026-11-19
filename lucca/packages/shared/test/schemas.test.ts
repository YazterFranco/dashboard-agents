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
      grade: 2,
      lang: 'es',
      voiceMode: 'both',
      theme: 'dark',
      speechRate: 0.9,
      tz: 'America/Panama',
      aiMonthlyCapUsd: 20,
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

  it('rejects a child name that is empty, only spaces or longer than 30', () => {
    expect(SettingsSchema.safeParse({ childName: '' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ childName: '   ' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ childName: 'a'.repeat(31) }).success).toBe(false);
  });

  it('accepts a name of exactly 30 characters and trims it', () => {
    expect(SettingsSchema.parse({ childName: 'a'.repeat(30) }).childName).toHaveLength(30);
    expect(SettingsSchema.parse({ childName: '  Lucca ' }).childName).toBe('Lucca');
  });

  it('limits the grade to 1 to 6 whole numbers', () => {
    for (const grade of [1, 6]) expect(SettingsSchema.safeParse({ grade }).success).toBe(true);
    for (const grade of [0, 7, 2.5, -1, '2']) expect(SettingsSchema.safeParse({ grade }).success).toBe(false);
  });

  it('limits the speech rate to 0.7 to 1.2, borders included', () => {
    for (const speechRate of [0.7, 0.9, 1.2]) expect(SettingsSchema.safeParse({ speechRate }).success).toBe(true);
    for (const speechRate of [0.69, 1.21, 0, -1, 'rápido']) expect(SettingsSchema.safeParse({ speechRate }).success).toBe(false);
  });
});

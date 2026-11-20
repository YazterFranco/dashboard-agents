import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { TaskSchema, type ProgressEvent, type Task } from '@lucca/shared';
import { LuccaDb } from '../src/db.js';

function task(partial: Partial<Task> & { id: string }): Task {
  return TaskSchema.parse({ subject: 'science', title: 'Las partes de la planta', source: 'manual', ...partial });
}

describe('LuccaDb', () => {
  const opened: LuccaDb[] = [];
  const dirs: string[] = [];
  const open = (path = ':memory:') => {
    const db = new LuccaDb(path);
    opened.push(db);
    return db;
  };
  afterEach(() => {
    while (opened.length) opened.pop()!.close();
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });
  const tempFile = () => {
    const dir = mkdtempSync(join(tmpdir(), 'lucca-db-'));
    dirs.push(dir);
    return join(dir, 'nested', 'lucca.db');
  };

  it('migrates an empty db and is idempotent', () => {
    const file = tempFile();
    const a = open(file);
    expect(a.schemaVersion()).toBe(3);
    a.close();
    opened.pop();
    const b = open(file);
    expect(b.schemaVersion()).toBe(3);
  });

  it('roundtrips a task with translations and null dates', () => {
    const db = open();
    const t = task({ id: 't1', titleTranslations: { en: 'The parts of a plant' }, subjectLabel: 'Ciencias Naturales', dueDate: '2026-11-18' });
    db.upsertTask(t);
    expect(db.getTask('t1')).toEqual(t);
    expect(db.getTask('t1')!.assignedDate).toBeNull();
  });

  it('getTask returns null for an unknown id', () => {
    expect(open().getTask('nope')).toBeNull();
  });

  it('upsertTask updates an existing id instead of duplicating', () => {
    const db = open();
    db.upsertTask(task({ id: 't1', title: 'Uno' }));
    db.upsertTask(task({ id: 't1', title: 'Dos', hidden: true }));
    expect(db.listTasks()).toHaveLength(1);
    expect(db.getTask('t1')).toMatchObject({ title: 'Dos', hidden: true });
  });

  it('listTasks returns every task, hidden and retired included', () => {
    const db = open();
    db.upsertTask(task({ id: 'a' }));
    db.upsertTask(task({ id: 'b', hidden: true }));
    db.upsertTask(task({ id: 'c', retired: true }));
    expect(db.listTasks().map((t) => t.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('setTaskStatus changes only the status', () => {
    const db = open();
    const t = task({ id: 't1', dueDate: '2026-11-18' });
    db.upsertTask(t);
    db.setTaskStatus('t1', 'doing');
    expect(db.getTask('t1')).toEqual({ ...t, status: 'doing' });
  });

  it('progress is append-only and listed in ascending time order', () => {
    const db = open();
    const ev = (id: string, at: string): ProgressEvent => ({ id, taskId: 't1', kind: 'lesson_step', at });
    db.addProgress(ev('e2', '2026-11-17T16:00:00Z'));
    db.addProgress(ev('e1', '2026-11-17T15:00:00Z'));
    db.addProgress(ev('e1', '2026-11-17T15:00:00Z'));
    expect(db.listProgress().map((e) => e.id)).toEqual(['e1', 'e2']);
  });

  it('settings default, patch and persist', () => {
    const file = tempFile();
    const a = open(file);
    expect(a.getSettings()).toEqual({ childName: 'Lucca', grade: 2, lang: 'es', voiceMode: 'both', theme: 'dark', speechRate: 0.9, tz: 'America/Panama', aiMonthlyCapUsd: 20 });
    expect(a.setSettings({ lang: 'en' })).toMatchObject({ lang: 'en', childName: 'Lucca' });
    a.close();
    opened.pop();
    expect(open(file).getSettings().lang).toBe('en');
  });

  it('hasProgress tells whether a kind was ever recorded for a task', () => {
    const db = open();
    db.addProgress({ id: 'e1', taskId: 't1', kind: 'task_done', at: '2026-11-20T15:00:00Z' });
    expect(db.hasProgress('t1', 'task_done')).toBe(true);
    expect(db.hasProgress('t1', 'lesson_done')).toBe(false);
    expect(db.hasProgress('t2', 'task_done')).toBe(false);
  });

  it('deleteTask removes the task and ignores an unknown id', () => {
    const db = open();
    db.upsertTask(task({ id: 'a' }));
    db.upsertTask(task({ id: 'b' }));
    db.deleteTask('a');
    db.deleteTask('no-existe');
    expect(db.listTasks().map((t) => t.id)).toEqual(['b']);
  });

  it('keeps the PIN record: none at first, persisted and overwritten', () => {
    const file = tempFile();
    const a = open(file);
    expect(a.getPinRecord()).toBeNull();
    a.setPinRecord('scrypt$aa$bb');
    a.setPinRecord('scrypt$cc$dd');
    a.close();
    opened.pop();
    expect(open(file).getPinRecord()).toBe('scrypt$cc$dd');
  });

  it('the PIN record never shows up in the settings', () => {
    const db = open();
    db.setPinRecord('scrypt$aa$bb');
    expect(JSON.stringify(db.getSettings())).not.toContain('scrypt');
  });

  it('creates, reads, touches and deletes sessions', () => {
    const db = open();
    expect(db.getSession('s1')).toBeNull();
    db.createSession('s1', '2026-11-18T10:00:00.000Z');
    expect(db.getSession('s1')).toEqual({ id: 's1', createdAt: '2026-11-18T10:00:00.000Z', lastSeen: '2026-11-18T10:00:00.000Z' });
    db.touchSession('s1', '2026-11-18T10:05:00.000Z');
    expect(db.getSession('s1')!.lastSeen).toBe('2026-11-18T10:05:00.000Z');
    expect(db.getSession('s1')!.createdAt).toBe('2026-11-18T10:00:00.000Z');
    db.deleteSession('s1');
    db.deleteSession('s1');
    expect(db.getSession('s1')).toBeNull();
  });

  it('deletes only the sessions idle since before the given moment, and says how many', () => {
    const db = open();
    db.createSession('old', '2026-11-18T09:00:00.000Z');
    db.createSession('recent', '2026-11-18T10:00:00.000Z');
    expect(db.deleteSessionsIdleSince('2026-11-18T09:30:00.000Z')).toBe(1);
    expect(db.getSession('old')).toBeNull();
    expect(db.getSession('recent')).not.toBeNull();
    expect(db.deleteSessionsIdleSince('2026-11-18T09:30:00.000Z')).toBe(0);
  });

  it('deleteAllSessions empties the table', () => {
    const db = open();
    db.createSession('a', '2026-11-18T10:00:00.000Z');
    db.createSession('b', '2026-11-18T10:00:00.000Z');
    db.deleteAllSessions();
    expect(db.getSession('a')).toBeNull();
    expect(db.getSession('b')).toBeNull();
  });

  it('reads settings saved before the grade and the speech rate existed with their defaults', () => {
    const file = tempFile();
    open(file).close();
    opened.pop();
    const sqlite = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
    const raw = new sqlite.DatabaseSync(file);
    raw.prepare("INSERT INTO settings (key, value) VALUES ('settings', ?)").run(JSON.stringify({ childName: 'Lucca', lang: 'en', voiceMode: 'text', theme: 'light', tz: 'America/Panama' }));
    raw.close();
    expect(open(file).getSettings()).toMatchObject({ lang: 'en', voiceMode: 'text', theme: 'light', grade: 2, speechRate: 0.9 });
  });
});

describe('LuccaDb lessons and AI usage', () => {
  it('stores a lesson per task and variant, replaces it, and deleting the task removes them', async () => {
    const { RecordedLessonModel } = await import('../src/ai/recorded.js');
    const { TaskSchema } = await import('@lucca/shared');
    const db = new LuccaDb(':memory:');
    db.upsertTask(TaskSchema.parse({ id: 't', subject: 'science', title: 'Las partes de la planta', source: 'manual' }));
    const out = (await new RecordedLessonModel().generate({ task: { subject: 'science', title: 'Las partes de la planta', titleEn: '', description: '' }, grade: 2, variant: 'default' })) as unknown as { doc: never };
    db.saveLesson({ taskId: 't', variant: 'default', doc: out.doc, source: 'recorded', issues: [], createdAt: '2026-11-18T00:00:00Z' });
    expect(db.getLesson('t', 'default')?.source).toBe('recorded');
    expect(db.getLesson('t', 'alternative')).toBeNull();
    db.saveLesson({ taskId: 't', variant: 'default', doc: out.doc, source: 'fallback', issues: ['x'], createdAt: '2026-11-18T01:00:00Z' });
    expect(db.getLesson('t', 'default')?.source).toBe('fallback');
    expect(db.listFallbackLessons()).toHaveLength(1);
    db.deleteTask('t');
    expect(db.getLesson('t', 'default')).toBeNull();
  });

  it('adds up the AI cost from a moment on', () => {
    const db = new LuccaDb(':memory:');
    const usage = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };
    db.addAiUsage({ id: 'a', at: '2026-10-31T23:00:00.000Z', taskId: null, purpose: 'lesson', usage, costUsd: 3 });
    db.addAiUsage({ id: 'b', at: '2026-11-02T10:00:00.000Z', taskId: 't', purpose: 'lesson', usage, costUsd: 1.25 });
    expect(db.aiCostSince('2026-11-01T05:00:00.000Z')).toBeCloseTo(1.25);
    expect(db.aiCostSince('2026-12-01T05:00:00.000Z')).toBe(0);
  });
});

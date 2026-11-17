import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    expect(a.schemaVersion()).toBe(1);
    a.close();
    opened.pop();
    const b = open(file);
    expect(b.schemaVersion()).toBe(1);
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
    expect(a.getSettings()).toEqual({ childName: 'Lucca', lang: 'es', voiceMode: 'both', theme: 'dark', tz: 'America/Panama' });
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
});

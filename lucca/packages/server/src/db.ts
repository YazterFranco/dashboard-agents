import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';
import { LessonDocSchema, QuizBlockSchema, SettingsSchema, TaskSchema, type LessonDoc, type QuizBlock, type Subject, type ProgressEvent, type ProgressKind, type Settings, type Task, type TaskStatus } from '@lucca/shared';

/** Cada migración sube `PRAGMA user_version` en uno. No se editan las antiguas: se añade una nueva. */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    subject TEXT NOT NULL,
    subject_label TEXT,
    title TEXT NOT NULL,
    title_translations TEXT NOT NULL DEFAULT '{}',
    description TEXT NOT NULL DEFAULT '',
    assigned_date TEXT,
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'todo',
    hidden INTEGER NOT NULL DEFAULT 0,
    retired INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE progress_events (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    at TEXT NOT NULL
  );
  CREATE INDEX progress_events_at ON progress_events (at);
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE parent_sessions (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    last_seen TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE lessons (
    task_id TEXT NOT NULL,
    variant TEXT NOT NULL,
    doc TEXT NOT NULL,
    source TEXT NOT NULL,
    issues TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    PRIMARY KEY (task_id, variant)
  );
  CREATE TABLE ai_usage (
    id TEXT PRIMARY KEY,
    at TEXT NOT NULL,
    task_id TEXT,
    purpose TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    cache_read_tokens INTEGER NOT NULL,
    cache_write_tokens INTEGER NOT NULL,
    cost_usd REAL NOT NULL
  );
  CREATE INDEX ai_usage_at ON ai_usage (at);
  `,
  `
  CREATE TABLE review_items (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    task_title TEXT NOT NULL,
    question TEXT NOT NULL,
    box INTEGER NOT NULL DEFAULT 1,
    due_date TEXT NOT NULL,
    last_seen TEXT
  );
  `,
];

export interface StoredReviewItem {
  id: string;
  taskId: string;
  subject: Subject;
  taskTitle: string;
  question: QuizBlock;
  box: number;
  dueDate: string;
  lastSeen: string | null;
}

export type LessonVariant = 'default' | 'alternative';
export type LessonSource = 'ai' | 'recorded' | 'fallback';
export interface StoredLesson {
  taskId: string;
  variant: LessonVariant;
  doc: LessonDoc;
  source: LessonSource;
  issues: string[];
  createdAt: string;
}
export interface AiUsageRecord {
  id: string;
  at: string;
  taskId: string | null;
  purpose: string;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
  costUsd: number;
}

type Row = Record<string, unknown>;

function taskFromRow(r: Row): Task {
  return TaskSchema.parse({
    id: r.id,
    source: r.source,
    subject: r.subject,
    subjectLabel: r.subject_label ?? undefined,
    title: r.title,
    titleTranslations: JSON.parse(String(r.title_translations)),
    description: r.description,
    assignedDate: r.assigned_date,
    dueDate: r.due_date,
    status: r.status,
    hidden: r.hidden === 1,
    retired: r.retired === 1,
  });
}

/** Almacén SQLite de Lucca (node:sqlite, sin dependencias nativas). */
export class LuccaDb {
  private db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    // Se carga aquí para poder silenciar el ExperimentalWarning de node:sqlite antes de que salga.
    const sqlite = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
    this.db = new sqlite.DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.migrate();
  }

  private migrate(): void {
    for (let v = this.schemaVersion(); v < MIGRATIONS.length; v++) {
      this.db.exec('BEGIN');
      try {
        this.db.exec(MIGRATIONS[v]);
        this.db.exec(`PRAGMA user_version = ${v + 1}`);
        this.db.exec('COMMIT');
      } catch (err) {
        this.db.exec('ROLLBACK');
        throw err;
      }
    }
  }

  schemaVersion(): number {
    return Number((this.db.prepare('PRAGMA user_version').get() as Row).user_version);
  }

  close(): void {
    this.db.close();
  }

  upsertTask(t: Task): void {
    this.db
      .prepare(
        `INSERT INTO tasks (id, source, subject, subject_label, title, title_translations, description, assigned_date, due_date, status, hidden, retired)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           source = excluded.source, subject = excluded.subject, subject_label = excluded.subject_label,
           title = excluded.title, title_translations = excluded.title_translations, description = excluded.description,
           assigned_date = excluded.assigned_date, due_date = excluded.due_date, status = excluded.status,
           hidden = excluded.hidden, retired = excluded.retired`,
      )
      .run(
        t.id,
        t.source,
        t.subject,
        t.subjectLabel ?? null,
        t.title,
        JSON.stringify(t.titleTranslations),
        t.description,
        t.assignedDate,
        t.dueDate,
        t.status,
        t.hidden ? 1 : 0,
        t.retired ? 1 : 0,
      );
  }

  getTask(id: string): Task | null {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Row | undefined;
    return row ? taskFromRow(row) : null;
  }

  listTasks(): Task[] {
    return (this.db.prepare('SELECT * FROM tasks ORDER BY rowid').all() as Row[]).map(taskFromRow);
  }

  deleteTask(id: string): void {
    this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    this.db.prepare('DELETE FROM lessons WHERE task_id = ?').run(id);
  }

  setTaskStatus(id: string, status: TaskStatus): void {
    this.db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, id);
  }

  /** Solo añade: un `id` repetido se ignora. */
  addProgress(ev: ProgressEvent): void {
    this.db.prepare('INSERT OR IGNORE INTO progress_events (id, task_id, kind, at) VALUES (?, ?, ?, ?)').run(ev.id, ev.taskId, ev.kind, ev.at);
  }

  hasProgress(taskId: string, kind: ProgressKind): boolean {
    return this.db.prepare('SELECT 1 FROM progress_events WHERE task_id = ? AND kind = ? LIMIT 1').get(taskId, kind) !== undefined;
  }

  listProgress(): ProgressEvent[] {
    const rows = this.db.prepare('SELECT id, task_id, kind, at FROM progress_events ORDER BY at ASC, rowid ASC').all() as Row[];
    return rows.map((r) => ({ id: String(r.id), taskId: String(r.task_id), kind: r.kind as ProgressEvent['kind'], at: String(r.at) }));
  }

  getSettings(): Settings {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = 'settings'").get() as Row | undefined;
    return SettingsSchema.parse(row ? JSON.parse(String(row.value)) : {});
  }

  setSettings(patch: Partial<Settings>): Settings {
    const next = SettingsSchema.parse({ ...this.getSettings(), ...patch });
    this.db
      .prepare("INSERT INTO settings (key, value) VALUES ('settings', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(JSON.stringify(next));
    return next;
  }

  /** El PIN del padre, ya con hash (nunca en claro). Vive en la tabla de ajustes con su propia clave, aparte de los ajustes del niño. */
  getPinRecord(): string | null {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = 'pin'").get() as Row | undefined;
    return row ? String(row.value) : null;
  }

  setPinRecord(record: string): void {
    this.db.prepare("INSERT INTO settings (key, value) VALUES ('pin', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(record);
  }

  createSession(id: string, at: string): void {
    this.db.prepare('INSERT INTO parent_sessions (id, created_at, last_seen) VALUES (?, ?, ?)').run(id, at, at);
  }

  getSession(id: string): { id: string; createdAt: string; lastSeen: string } | null {
    const row = this.db.prepare('SELECT id, created_at, last_seen FROM parent_sessions WHERE id = ?').get(id) as Row | undefined;
    return row ? { id: String(row.id), createdAt: String(row.created_at), lastSeen: String(row.last_seen) } : null;
  }

  touchSession(id: string, at: string): void {
    this.db.prepare('UPDATE parent_sessions SET last_seen = ? WHERE id = ?').run(at, id);
  }

  deleteSession(id: string): void {
    this.db.prepare('DELETE FROM parent_sessions WHERE id = ?').run(id);
  }

  /** Borra las sesiones sin actividad desde antes de `before` y devuelve cuántas eran. */
  deleteSessionsIdleSince(before: string): number {
    return Number(this.db.prepare('DELETE FROM parent_sessions WHERE last_seen < ?').run(before).changes);
  }

  deleteAllSessions(): void {
    this.db.exec('DELETE FROM parent_sessions');
  }

  getLesson(taskId: string, variant: LessonVariant): StoredLesson | null {
    const r = this.db.prepare('SELECT * FROM lessons WHERE task_id = ? AND variant = ?').get(taskId, variant) as Row | undefined;
    if (!r) return null;
    return {
      taskId: String(r.task_id),
      variant: r.variant as LessonVariant,
      doc: LessonDocSchema.parse(JSON.parse(String(r.doc))),
      source: r.source as LessonSource,
      issues: JSON.parse(String(r.issues)) as string[],
      createdAt: String(r.created_at),
    };
  }

  saveLesson(l: StoredLesson): void {
    this.db
      .prepare(
        `INSERT INTO lessons (task_id, variant, doc, source, issues, created_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(task_id, variant) DO UPDATE SET doc = excluded.doc, source = excluded.source, issues = excluded.issues, created_at = excluded.created_at`,
      )
      .run(l.taskId, l.variant, JSON.stringify(l.doc), l.source, JSON.stringify(l.issues), l.createdAt);
  }

  deleteLessons(taskId: string): void {
    this.db.prepare('DELETE FROM lessons WHERE task_id = ?').run(taskId);
  }

  /** Lecciones de respaldo (la IA falló): papá las ve como aviso. */
  listFallbackLessons(): { taskId: string; variant: LessonVariant; issues: string[]; createdAt: string }[] {
    return (this.db.prepare("SELECT task_id, variant, issues, created_at FROM lessons WHERE source = 'fallback' ORDER BY created_at DESC").all() as Row[]).map((r) => ({
      taskId: String(r.task_id),
      variant: r.variant as LessonVariant,
      issues: JSON.parse(String(r.issues)) as string[],
      createdAt: String(r.created_at),
    }));
  }

  addAiUsage(u: AiUsageRecord): void {
    this.db
      .prepare('INSERT INTO ai_usage (id, at, task_id, purpose, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(u.id, u.at, u.taskId, u.purpose, u.usage.inputTokens, u.usage.outputTokens, u.usage.cacheReadTokens, u.usage.cacheWriteTokens, u.costUsd);
  }

  /** Gasto de IA desde un instante (ISO), en USD. */
  aiCostSince(fromIso: string): number {
    const r = this.db.prepare('SELECT COALESCE(SUM(cost_usd), 0) AS total FROM ai_usage WHERE at >= ?').get(fromIso) as Row;
    return Number(r.total);
  }

  /** Añade una pregunta al repaso; si ya existe, no la toca (no reinicia su caja). */
  addReviewItem(item: Omit<StoredReviewItem, 'box' | 'lastSeen'>): void {
    this.db
      .prepare('INSERT OR IGNORE INTO review_items (id, task_id, subject, task_title, question, box, due_date) VALUES (?, ?, ?, ?, ?, 1, ?)')
      .run(item.id, item.taskId, item.subject, item.taskTitle, JSON.stringify(item.question), item.dueDate);
  }

  listReviewItems(): StoredReviewItem[] {
    return (this.db.prepare('SELECT * FROM review_items').all() as Row[]).map((r) => ({
      id: String(r.id),
      taskId: String(r.task_id),
      subject: r.subject as Subject,
      taskTitle: String(r.task_title),
      question: QuizBlockSchema.parse(JSON.parse(String(r.question))),
      box: Number(r.box),
      dueDate: String(r.due_date),
      lastSeen: r.last_seen === null ? null : String(r.last_seen),
    }));
  }

  getReviewItem(id: string): StoredReviewItem | null {
    return this.listReviewItems().find((i) => i.id === id) ?? null;
  }

  updateReviewItem(id: string, box: number, dueDate: string, lastSeen: string): void {
    this.db.prepare('UPDATE review_items SET box = ?, due_date = ?, last_seen = ? WHERE id = ?').run(box, dueDate, lastSeen, id);
  }
}

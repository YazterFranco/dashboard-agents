import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';
import { SettingsSchema, TaskSchema, type ProgressEvent, type ProgressKind, type Settings, type Task, type TaskStatus } from '@lucca/shared';

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
];

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
}

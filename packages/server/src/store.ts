import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { AgentEvent, Platform } from '@agentdash/shared';

/** Append-only event history in SQLite (node:sqlite, no native dependencies). */
export class EventStore {
  private db: DatabaseSync;
  private stmts: Record<'insert' | 'since' | 'byAgent' | 'rawAll' | 'rawByPlatform' | 'prune' | 'count', StatementSync>;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    // Loaded lazily so the CLI can silence node:sqlite's ExperimentalWarning before it fires.
    const sqlite = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
    this.db = new sqlite.DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        ts INTEGER NOT NULL,
        platform TEXT NOT NULL,
        surface TEXT NOT NULL,
        session_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        parent_agent_id TEXT,
        type TEXT NOT NULL,
        json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS events_ts ON events (ts);
      CREATE INDEX IF NOT EXISTS events_agent ON events (agent_id, ts);
    `);
    this.stmts = {
      insert: this.db.prepare(
        'INSERT OR IGNORE INTO events (id, ts, platform, surface, session_id, agent_id, parent_agent_id, type, json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ),
      since: this.db.prepare('SELECT json FROM events WHERE ts >= ? ORDER BY ts ASC, rowid ASC'),
      byAgent: this.db.prepare('SELECT json FROM events WHERE agent_id = ? ORDER BY ts DESC, rowid DESC LIMIT ?'),
      rawAll: this.db.prepare('SELECT json FROM events ORDER BY ts DESC, rowid DESC LIMIT ?'),
      rawByPlatform: this.db.prepare('SELECT json FROM events WHERE platform = ? ORDER BY ts DESC, rowid DESC LIMIT ?'),
      prune: this.db.prepare('DELETE FROM events WHERE ts < ?'),
      count: this.db.prepare('SELECT COUNT(*) AS n FROM events'),
    };
  }

  insert(ev: AgentEvent): void {
    this.stmts.insert.run(ev.id, ev.ts, ev.platform, ev.surface, ev.sessionId, ev.agentId, ev.parentAgentId ?? null, ev.type, JSON.stringify(ev));
  }

  since(ts: number): AgentEvent[] {
    return rows(this.stmts.since.all(ts));
  }

  byAgent(agentId: string, limit: number): AgentEvent[] {
    return rows(this.stmts.byAgent.all(agentId, limit));
  }

  raw(platform: Platform | undefined, limit: number): AgentEvent[] {
    return rows(platform ? this.stmts.rawByPlatform.all(platform, limit) : this.stmts.rawAll.all(limit));
  }

  prune(beforeTs: number): number {
    return Number(this.stmts.prune.run(beforeTs).changes);
  }

  count(): number {
    return Number((this.stmts.count.get() as { n: number }).n);
  }

  close(): void {
    if (this.db.isOpen) this.db.close();
  }
}

function rows(result: unknown[]): AgentEvent[] {
  return result.map((r) => JSON.parse((r as { json: string }).json) as AgentEvent);
}

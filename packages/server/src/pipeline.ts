import { randomUUID } from 'node:crypto';
import type { AgentEvent, AgentState, HookEnvelope } from '@agentdash/shared';
import { adapt } from './adapters/index.js';
import { markStale, reduce, type AgentMap } from './state.js';
import type { EventStore } from './store.js';

export interface IngestResult {
  events: AgentEvent[];
  changed: AgentState[];
}

/**
 * Turns hook envelopes into stored, state-applied events:
 * adapt → resolve subagents → pair tool durations → persist → reduce.
 */
export class Pipeline {
  private agentsById: AgentMap = new Map();
  /** "<sessionId>|<externalAgentId>" → child agent id */
  private bindings = new Map<string, string>();
  private boundChildren = new Set<string>();
  /** pairing key → start timestamps (FIFO) */
  private openTools = new Map<string, number[]>();
  private storeFailed = false;

  constructor(
    private store: EventStore | null,
    private log: (msg: string) => void = (msg) => console.error(`[agentdash] ${msg}`),
  ) {}

  ingest(env: HookEnvelope): IngestResult {
    const events: AgentEvent[] = [];
    const changed = new Set<string>();
    for (const adapted of adapt(env)) {
      for (const ev of this.resolve(adapted)) {
        this.pairDuration(ev);
        this.persist(ev);
        for (const id of reduce(this.agentsById, ev)) changed.add(id);
        events.push(ev);
      }
    }
    return { events, changed: [...changed].map((id) => this.agentsById.get(id)!) };
  }

  /** Rebuilds state (and subagent bindings) from already-resolved stored events. */
  replay(events: AgentEvent[]): void {
    for (const ev of events) {
      if (ev.externalAgentId && ev.parentAgentId && ev.agentId !== ev.sessionId) this.bind(ev.sessionId, ev.externalAgentId, ev.agentId);
      this.pairDuration(ev);
      reduce(this.agentsById, ev);
    }
  }

  agents(): AgentState[] {
    return [...this.agentsById.values()];
  }

  tick(now: number): AgentState[] {
    return markStale(this.agentsById, now).map((id) => this.agentsById.get(id)!);
  }

  private bind(sessionId: string, externalId: string, childId: string): void {
    this.bindings.set(`${sessionId}|${externalId}`, childId);
    this.boundChildren.add(childId);
  }

  private latestOpenChild(sessionId: string, unboundOnly: boolean): AgentState | undefined {
    let best: AgentState | undefined;
    for (const a of this.agentsById.values()) {
      if (a.sessionId !== sessionId || !a.parentId || a.status === 'done') continue;
      if (unboundOnly && this.boundChildren.has(a.id)) continue;
      if (!best || a.startedAt >= best.startedAt) best = a;
    }
    return best;
  }

  private resolve(ev: AgentEvent): AgentEvent[] {
    if (ev.externalAgentId) {
      const key = `${ev.sessionId}|${ev.externalAgentId}`;
      let childId = this.bindings.get(key);
      if (!childId) {
        const open = this.latestOpenChild(ev.sessionId, true);
        if (open) {
          childId = open.id;
          this.bind(ev.sessionId, ev.externalAgentId, childId);
        }
      }
      if (ev.type === 'subagent.start') {
        if (childId) return []; // the Task call already opened this child
        this.bind(ev.sessionId, ev.externalAgentId, ev.agentId);
        return [ev];
      }
      if (childId) {
        const child = this.agentsById.get(childId);
        return [{ ...ev, agentId: childId, parentAgentId: child?.parentId ?? ev.sessionId }];
      }
      if (ev.type !== 'subagent.end') {
        const implicitId = `${ev.sessionId}:${ev.externalAgentId}`;
        this.bind(ev.sessionId, ev.externalAgentId, implicitId);
        const implicit: AgentEvent = {
          id: randomUUID(), ts: ev.ts, platform: ev.platform, surface: ev.surface, sessionId: ev.sessionId,
          agentId: implicitId, parentAgentId: ev.sessionId, externalAgentId: ev.externalAgentId,
          type: 'subagent.start', subagent: { name: 'subagente' }, ...(ev.cwd ? { cwd: ev.cwd } : {}),
        };
        return [implicit, { ...ev, agentId: implicitId, parentAgentId: ev.sessionId }];
      }
    }
    if (ev.type === 'subagent.end' && ev.agentId === ev.sessionId) {
      const open = this.latestOpenChild(ev.sessionId, false);
      if (open) return [{ ...ev, agentId: open.id, parentAgentId: open.parentId }];
    }
    return [ev];
  }

  private pairDuration(ev: AgentEvent): void {
    if (!ev.tool || (ev.type !== 'tool.start' && ev.type !== 'tool.end')) return;
    const key = ev.tool.callId ? `${ev.agentId}|id|${ev.tool.callId}` : `${ev.agentId}|name|${ev.tool.name}`;
    if (ev.type === 'tool.start') {
      const list = this.openTools.get(key) ?? [];
      list.push(ev.ts);
      this.openTools.set(key, list);
      return;
    }
    const list = this.openTools.get(key);
    const startedAt = list?.shift();
    if (list && list.length === 0) this.openTools.delete(key);
    if (startedAt !== undefined && ev.tool.durationMs === undefined) ev.tool = { ...ev.tool, durationMs: Math.max(0, ev.ts - startedAt) };
  }

  private persist(ev: AgentEvent): void {
    if (!this.store) return;
    try {
      this.store.insert(ev);
      this.storeFailed = false;
    } catch (err) {
      if (!this.storeFailed) this.log(`no se pudo guardar el evento en SQLite: ${(err as Error).message}`);
      this.storeFailed = true;
    }
  }
}

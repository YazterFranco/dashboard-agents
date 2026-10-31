import { describe, expect, it } from 'vitest';
import type { HookEnvelope } from '@agentdash/shared';
import { Pipeline } from '../src/pipeline.js';
import { EventStore } from '../src/store.js';
import { load, withPayload } from './helpers.js';

const base = load('claude/pre-edit').receivedAt;
function env(name: string, patch: Partial<HookEnvelope> = {}): HookEnvelope {
  return { ...load(name), ...patch };
}

describe('Pipeline', () => {
  it('computes tool duration by pairing start and end on callId', () => {
    const p = new Pipeline(null);
    p.ingest(env('claude/pre-edit'));
    const r = p.ingest(env('claude/post-edit', { receivedAt: base + 1500 }));
    expect(r.events[0].tool!.durationMs).toBe(1500);
    expect(r.changed.map((a) => a.id)).toContain('sess-1');
  });

  it('pairs Kiro tools without callId by tool name in order', () => {
    const p = new Pipeline(null);
    p.ingest(env('kiro-cli/pre-tool'));
    const r = p.ingest(env('kiro-cli/post-tool', { receivedAt: load('kiro-cli/post-tool').receivedAt + 700 }));
    expect(r.events[0].tool!.durationMs).toBe(700);
  });

  it('attributes tools that carry agent_id to the open Task child', () => {
    const p = new Pipeline(null);
    p.ingest(env('claude/pre-task'));
    p.ingest(env('claude/tool-in-subagent'));
    const child = p.agents().find((a) => a.id === 'sess-1:tu-task')!;
    expect(child.toolCount).toBe(1);
    expect(child.currentTool!.summary).toBe('npm test -- auth');
    expect(p.agents().find((a) => a.id === 'sess-1')!.toolCount).toBe(1); // only the Task call
  });

  it('closes the bound child on SubagentStop', () => {
    const p = new Pipeline(null);
    p.ingest(env('claude/pre-task'));
    p.ingest(env('claude/tool-in-subagent'));
    p.ingest(env('claude/subagent-stop'));
    expect(p.agents().find((a) => a.id === 'sess-1:tu-task')!.status).toBe('done');
    expect(p.agents().find((a) => a.id === 'sess-1')!.status).not.toBe('done');
  });

  it('closes the most recent open child when SubagentStop has no agent_id', () => {
    const p = new Pipeline(null);
    p.ingest(env('claude/pre-task'));
    const stop = load('claude/subagent-stop');
    const payload = { ...(stop.payload as Record<string, unknown>) };
    delete payload.agent_id;
    p.ingest({ ...stop, payload });
    expect(p.agents().find((a) => a.id === 'sess-1:tu-task')!.status).toBe('done');
  });

  it('creates an implicit child when agent_id arrives with no open child', () => {
    const p = new Pipeline(null);
    p.ingest(env('claude/tool-in-subagent'));
    const child = p.agents().find((a) => a.id === 'sess-1:agent-7')!;
    expect(child).toMatchObject({ parentId: 'sess-1', toolCount: 1 });
  });

  it('does not duplicate a child when SubagentStart follows a Task call', () => {
    const p = new Pipeline(null);
    p.ingest(env('claude/pre-task'));
    p.ingest(withPayload(load('claude/subagent-stop'), { hook_event_name: 'SubagentStart', agent_type: 'test-runner' }));
    expect(p.agents().filter((a) => a.parentId === 'sess-1')).toHaveLength(1);
  });

  it('survives joining mid-session (tool.end without tool.start)', () => {
    const q = new Pipeline(null);
    q.ingest(env('claude/post-edit'));
    expect(q.agents()[0].status).toBe('working');
    expect(q.agents()[0].lastTool!.durationMs).toBeUndefined();
  });

  it('persists events and rebuilds the same state on replay', () => {
    const store = new EventStore(':memory:');
    const p = new Pipeline(store);
    for (const name of ['claude/session-start', 'claude/prompt', 'claude/pre-task', 'claude/tool-in-subagent', 'claude/pre-edit', 'kiro-cli/pre-power']) p.ingest(env(name));
    const p2 = new Pipeline(null);
    p2.replay(store.since(0));
    expect(p2.agents()).toEqual(p.agents());
    // bindings survive replay: a later subagent tool still lands on the child
    p2.ingest(env('claude/tool-in-subagent'));
    expect(p2.agents().find((a) => a.id === 'sess-1:tu-task')!.toolCount).toBe(2);
    store.close();
  });

  it('keeps working in memory when the store throws', () => {
    const store = new EventStore(':memory:');
    store.close();
    const p = new Pipeline(store, () => {});
    expect(() => p.ingest(env('claude/prompt'))).not.toThrow();
    expect(p.agents()).toHaveLength(1);
  });

  it('marks stale agents on tick', () => {
    const p = new Pipeline(null);
    p.ingest(env('claude/prompt'));
    expect(p.tick(base + 600_001).map((a) => a.status)).toEqual(['stale']);
  });
});

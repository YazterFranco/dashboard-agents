import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentEvent } from '@agentdash/shared';
import { EventStore } from '../src/store.js';

function ev(id: string, ts: number, partial: Partial<AgentEvent> = {}): AgentEvent {
  return { id, ts, platform: 'claude', surface: 'cli', sessionId: 's', agentId: 'a', type: 'prompt', ...partial };
}

describe('EventStore', () => {
  let store: EventStore;
  afterEach(() => store?.close());

  it('returns events since a timestamp in ascending order', () => {
    store = new EventStore(':memory:');
    store.insert(ev('1', 1));
    store.insert(ev('3', 3));
    store.insert(ev('2', 2));
    expect(store.since(2).map((e) => e.ts)).toEqual([2, 3]);
  });

  it('returns the latest events of one agent, newest first', () => {
    store = new EventStore(':memory:');
    store.insert(ev('1', 1));
    store.insert(ev('2', 2));
    store.insert(ev('3', 3));
    store.insert(ev('4', 4, { agentId: 'b' }));
    expect(store.byAgent('a', 2).map((e) => e.id)).toEqual(['3', '2']);
  });

  it('prunes old events', () => {
    store = new EventStore(':memory:');
    store.insert(ev('1', 1));
    store.insert(ev('2', 2));
    store.insert(ev('3', 3));
    expect(store.prune(3)).toBe(2);
    expect(store.count()).toBe(1);
  });

  it('filters raw events by platform', () => {
    store = new EventStore(':memory:');
    store.insert(ev('1', 1, { raw: '{}' }));
    store.insert(ev('2', 2, { platform: 'kiro', raw: '{"k":1}' }));
    expect(store.raw('kiro', 10).map((e) => e.id)).toEqual(['2']);
    expect(store.raw(undefined, 10).map((e) => e.id)).toEqual(['2', '1']);
  });

  it('round-trips a full event', () => {
    store = new EventStore(':memory:');
    const full = ev('x', 5, {
      type: 'tool.end', parentAgentId: 'p', cwd: '/w', raw: '{"a":1}',
      tool: { name: 'mcp__github__x', kind: 'mcp', source: 'github', callId: 'c', ok: false, durationMs: 12, summary: 's' },
    });
    store.insert(full);
    expect(store.since(0)).toEqual([full]);
  });

  it('creates the parent directory of a file database', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentdash-'));
    const path = join(dir, 'nested', 'db.sqlite');
    store = new EventStore(path);
    store.insert(ev('1', 1));
    expect(existsSync(path)).toBe(true);
  });
});

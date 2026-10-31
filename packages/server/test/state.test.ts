import { beforeEach, describe, expect, it } from 'vitest';
import type { AgentEvent } from '@agentdash/shared';
import { markStale, reduce, type AgentMap } from '../src/state.js';

const t0 = 1_000_000;
let n = 0;
function ev(partial: Partial<AgentEvent>): AgentEvent {
  n += 1;
  return { id: `e${n}`, ts: t0 + n, platform: 'claude', surface: 'cli', sessionId: 's1', agentId: 's1', type: 'prompt', ...partial };
}

describe('reduce', () => {
  let m: AgentMap;
  beforeEach(() => {
    m = new Map();
    n = 0;
  });

  it('creates a waiting agent on session.start named after the folder', () => {
    expect(reduce(m, ev({ type: 'session.start', cwd: '/home/u/api' }))).toEqual(['s1']);
    expect(m.get('s1')).toMatchObject({ status: 'waiting', name: 'api', platform: 'claude', surface: 'cli', toolCount: 0, children: [], extensions: [] });
  });

  it('starts working on prompt and keeps the first prompt as title', () => {
    reduce(m, ev({ type: 'session.start', cwd: '/home/u/api' }));
    reduce(m, ev({ type: 'prompt', text: 'refactoriza auth' }));
    reduce(m, ev({ type: 'prompt', text: 'otra cosa' }));
    expect(m.get('s1')).toMatchObject({ status: 'working', title: 'refactoriza auth' });
  });

  it('tracks the current tool, counts tools and collects extensions once', () => {
    reduce(m, ev({ type: 'tool.start', tool: { name: 'mcp__github__x', kind: 'mcp', source: 'github' } }));
    reduce(m, ev({ type: 'tool.start', tool: { name: 'mcp__github__y', kind: 'mcp', source: 'github' } }));
    const a = m.get('s1')!;
    expect(a.currentTool!.name).toBe('mcp__github__y');
    expect(a.toolCount).toBe(2);
    expect(a.extensions).toEqual(['mcp: github']);
  });

  it('clears the current tool on tool.end and remembers it as lastTool', () => {
    reduce(m, ev({ type: 'tool.start', tool: { name: 'Read', kind: 'builtin' } }));
    reduce(m, ev({ type: 'tool.end', tool: { name: 'Read', kind: 'builtin', ok: true, durationMs: 5 } }));
    expect(m.get('s1')!.currentTool).toBeUndefined();
    expect(m.get('s1')!.lastTool).toMatchObject({ name: 'Read', ok: true, durationMs: 5 });
  });

  it('enters error on a failed tool and keeps it through waiting', () => {
    reduce(m, ev({ type: 'tool.end', tool: { name: 'Bash', kind: 'builtin', ok: false } }));
    expect(m.get('s1')!.status).toBe('error');
    reduce(m, ev({ type: 'waiting' }));
    expect(m.get('s1')!.status).toBe('error');
    reduce(m, ev({ type: 'prompt', text: 'arréglalo' }));
    expect(m.get('s1')!.status).toBe('working');
  });

  it('moves to waiting on waiting events', () => {
    reduce(m, ev({ type: 'prompt' }));
    reduce(m, ev({ type: 'waiting' }));
    expect(m.get('s1')!.status).toBe('waiting');
  });

  it('links subagents to their parent', () => {
    reduce(m, ev({ type: 'session.start', cwd: '/home/u/api' }));
    const changed = reduce(m, ev({ type: 'subagent.start', agentId: 's1:t1', parentAgentId: 's1', subagent: { name: 'test-runner' } }));
    expect(changed.sort()).toEqual(['s1', 's1:t1']);
    expect(m.get('s1')!.children).toEqual(['s1:t1']);
    expect(m.get('s1:t1')).toMatchObject({ name: 'test-runner', parentId: 's1', status: 'working', sessionId: 's1' });
    expect(m.get('s1')!.status).toBe('working');
  });

  it('finishes subagents on subagent.end', () => {
    reduce(m, ev({ type: 'subagent.start', agentId: 's1:t1', parentAgentId: 's1', subagent: { name: 'x' } }));
    reduce(m, ev({ type: 'subagent.end', agentId: 's1:t1', parentAgentId: 's1' }));
    expect(m.get('s1:t1')).toMatchObject({ status: 'done' });
    expect(m.get('s1:t1')!.endedAt).toBeDefined();
  });

  it('finishes the session and its open children on session.end', () => {
    reduce(m, ev({ type: 'subagent.start', agentId: 's1:t1', parentAgentId: 's1', subagent: { name: 'x' } }));
    reduce(m, ev({ type: 'session.end' }));
    expect(m.get('s1')!.status).toBe('done');
    expect(m.get('s1:t1')!.status).toBe('done');
  });

  it('creates an agent on the fly when the first event is not session.start', () => {
    reduce(m, ev({ sessionId: 'x', agentId: 'x', type: 'tool.end', tool: { name: 'Read', kind: 'builtin', ok: true } }));
    expect(m.get('x')!.status).toBe('working');
  });

  it('keeps sessions apart', () => {
    reduce(m, ev({ type: 'prompt' }));
    reduce(m, ev({ sessionId: 's2', agentId: 's2', type: 'waiting' }));
    expect(m.size).toBe(2);
    expect(m.get('s1')!.status).toBe('working');
  });

  it('only touches lastEventAt for unparsed events', () => {
    reduce(m, ev({ type: 'prompt' }));
    const e = ev({ type: 'unparsed' });
    reduce(m, e);
    expect(m.get('s1')).toMatchObject({ status: 'working', lastEventAt: e.ts });
  });

  it('revives a stale agent on new activity', () => {
    reduce(m, ev({ type: 'prompt' }));
    m.get('s1')!.status = 'stale';
    reduce(m, ev({ type: 'tool.start', tool: { name: 'Read', kind: 'builtin' } }));
    expect(m.get('s1')!.status).toBe('working');
  });
});

describe('markStale', () => {
  it('marks agents idle for more than 10 minutes, except finished ones', () => {
    const m: AgentMap = new Map();
    reduce(m, { id: 'a', ts: t0, platform: 'kiro', surface: 'cli', sessionId: 's9', agentId: 's9', type: 'prompt' });
    reduce(m, { id: 'b', ts: t0, platform: 'kiro', surface: 'cli', sessionId: 's8', agentId: 's8', type: 'session.end' });
    expect(markStale(m, t0 + 600_000)).toEqual([]);
    expect(markStale(m, t0 + 600_001)).toEqual(['s9']);
    expect(m.get('s9')!.status).toBe('stale');
    expect(m.get('s8')!.status).toBe('done');
    expect(markStale(m, t0 + 700_000)).toEqual([]);
  });
});

describe('reduce — safety', () => {
  it('ignores subagent.end addressed to a root agent', () => {
    const m: AgentMap = new Map();
    reduce(m, { id: 'a', ts: 1, platform: 'claude', surface: 'cli', sessionId: 's', agentId: 's', type: 'prompt' });
    reduce(m, { id: 'b', ts: 2, platform: 'claude', surface: 'cli', sessionId: 's', agentId: 's', type: 'subagent.end' });
    expect(m.get('s')!.status).toBe('working');
  });
});

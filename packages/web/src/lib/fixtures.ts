import type { AgentEvent, AgentState, AgentStatus, Platform } from '@agentdash/shared';

let n = 0;
export function start(name: string, callId?: string, ts?: number): AgentEvent {
  n += 1;
  return { id: `e${n}`, ts: ts ?? n, platform: 'claude', surface: 'cli', sessionId: 's', agentId: 's', type: 'tool.start', tool: { name, kind: 'builtin', ...(callId ? { callId } : {}) } };
}
export function end(callIdOrName: string, ok = true, opts: { byName?: boolean; durationMs?: number } = {}): AgentEvent {
  n += 1;
  const tool = opts.byName ? { name: callIdOrName, kind: 'builtin' as const, ok } : { name: '?', kind: 'builtin' as const, callId: callIdOrName, ok };
  return { id: `e${n}`, ts: n, platform: 'claude', surface: 'cli', sessionId: 's', agentId: 's', type: 'tool.end', tool: { ...tool, ...(opts.durationMs ? { durationMs: opts.durationMs } : {}) } };
}
export function agent(id: string, status: AgentStatus = 'working', lastEventAt = 1, extra: Partial<AgentState> = {}): AgentState {
  return { id, sessionId: id, platform: 'claude' as Platform, surface: 'cli', name: id, status, extensions: [], toolCount: 0, startedAt: 0, lastEventAt, children: [], ...extra };
}

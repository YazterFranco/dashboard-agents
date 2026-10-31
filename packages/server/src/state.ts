import { STALE_AFTER_MS, extensionLabel, type AgentEvent, type AgentState, type ToolInfo } from '@agentdash/shared';

export type AgentMap = Map<string, AgentState>;

function folderName(path: string | undefined): string | undefined {
  return path?.split(/[\\/]/).filter(Boolean).at(-1);
}

function ensureAgent(m: AgentMap, ev: AgentEvent, id: string, parentId: string | undefined, changed: Set<string>): AgentState {
  let agent = m.get(id);
  if (agent) return agent;
  agent = {
    id,
    sessionId: ev.sessionId,
    ...(parentId ? { parentId } : {}),
    platform: ev.platform,
    surface: ev.surface,
    name: (parentId ? ev.subagent?.name : folderName(ev.cwd)) ?? `${ev.platform}-${id.slice(0, 6)}`,
    ...(ev.cwd ? { cwd: ev.cwd } : {}),
    status: 'waiting',
    extensions: [],
    toolCount: 0,
    startedAt: ev.ts,
    lastEventAt: ev.ts,
    children: [],
  };
  m.set(id, agent);
  changed.add(id);
  if (parentId) {
    const parent = ensureAgent(m, ev, parentId, undefined, changed);
    if (!parent.children.includes(id)) parent.children.push(id);
    changed.add(parentId);
  }
  return agent;
}

function addExtension(agent: AgentState, tool: ToolInfo | undefined): void {
  const label = tool && extensionLabel(tool);
  if (label && !agent.extensions.includes(label)) agent.extensions.push(label);
}

function finish(m: AgentMap, agent: AgentState, ts: number, changed: Set<string>): void {
  agent.status = 'done';
  agent.endedAt = ts;
  delete agent.currentTool;
  changed.add(agent.id);
  for (const childId of agent.children) {
    const child = m.get(childId);
    if (child && child.status !== 'done') finish(m, child, ts, changed);
  }
}

/** Applies one event to the agent map in place. Returns the ids of agents that changed. */
export function reduce(m: AgentMap, ev: AgentEvent): string[] {
  const changed = new Set<string>();
  const agent = ensureAgent(m, ev, ev.agentId, ev.parentAgentId, changed);
  changed.add(agent.id);
  agent.lastEventAt = Math.max(agent.lastEventAt, ev.ts);
  if (!agent.cwd && ev.cwd) agent.cwd = ev.cwd;

  switch (ev.type) {
    case 'session.start':
      if (agent.status === 'stale' || agent.status === 'done') agent.status = 'waiting';
      break;
    case 'prompt':
      agent.status = 'working';
      if (!agent.title && ev.text) agent.title = ev.text;
      break;
    case 'tool.start':
      agent.status = 'working';
      agent.toolCount += 1;
      if (ev.tool) agent.currentTool = { ...ev.tool, startedAt: ev.ts };
      addExtension(agent, ev.tool);
      break;
    case 'tool.end':
      delete agent.currentTool;
      if (ev.tool) agent.lastTool = ev.tool;
      addExtension(agent, ev.tool);
      agent.status = ev.tool?.ok === false ? 'error' : 'working';
      break;
    case 'subagent.start':
      if (!agent.parentId) break;
      agent.status = 'working';
      if (ev.subagent?.name) agent.name = ev.subagent.name;
      {
        const parent = m.get(agent.parentId);
        if (parent && parent.status !== 'error') parent.status = 'working';
      }
      break;
    case 'subagent.end':
      if (!agent.parentId) break;
      finish(m, agent, ev.ts, changed);
      break;
    case 'waiting':
      delete agent.currentTool;
      if (agent.status !== 'error') agent.status = 'waiting';
      break;
    case 'session.end':
      finish(m, agent, ev.ts, changed);
      break;
    case 'unparsed':
      break;
  }
  return [...changed];
}

/** Marks agents with no events for STALE_AFTER_MS as stale. Returns the ids that changed. */
export function markStale(m: AgentMap, now: number): string[] {
  const changed: string[] = [];
  for (const agent of m.values()) {
    if (agent.status === 'done' || agent.status === 'stale') continue;
    if (now - agent.lastEventAt > STALE_AFTER_MS) {
      agent.status = 'stale';
      changed.push(agent.id);
    }
  }
  return changed;
}

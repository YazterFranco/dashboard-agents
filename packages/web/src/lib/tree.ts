import type { AgentState, Platform } from '@agentdash/shared';

export type PlatformFilter = 'all' | Platform;
export interface TreeRow {
  agent: AgentState;
  depth: number;
}

export function buildTree(agents: AgentState[], filter: PlatformFilter): TreeRow[] {
  const visible = agents.filter((a) => filter === 'all' || a.platform === filter);
  const ids = new Set(visible.map((a) => a.id));
  const childrenOf = new Map<string, AgentState[]>();
  const roots: AgentState[] = [];
  for (const a of visible) {
    if (a.parentId && ids.has(a.parentId)) childrenOf.set(a.parentId, [...(childrenOf.get(a.parentId) ?? []), a]);
    else roots.push(a);
  }
  const recent = (x: AgentState, y: AgentState) => y.lastEventAt - x.lastEventAt;
  const ordered = [...roots.filter((r) => r.status !== 'done').sort(recent), ...roots.filter((r) => r.status === 'done').sort(recent)];
  const rows: TreeRow[] = [];
  const walk = (a: AgentState, depth: number) => {
    rows.push({ agent: a, depth });
    for (const c of (childrenOf.get(a.id) ?? []).sort((x, y) => x.startedAt - y.startedAt)) walk(c, depth + 1);
  };
  ordered.forEach((r) => walk(r, 0));
  return rows;
}

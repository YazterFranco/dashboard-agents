import type { AgentState } from '@agentdash/shared';

const pad = (n: number) => String(n).padStart(2, '0');

export function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${pad(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${pad(Math.floor((s % 3600) / 60))}m`;
}

export function duration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return elapsed(ms);
}

export function clock(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function platformLabel(a: Pick<AgentState, 'platform' | 'surface' | 'parentId'>): string {
  if (a.platform === 'kiro') return a.surface === 'ide' ? 'Kiro IDE' : 'Kiro CLI';
  if (a.parentId) return 'Claude Code · subagente';
  return a.surface === 'vscode' ? 'Claude Code · VS Code' : 'Claude Code · CLI';
}

export function shortToolName(name: string): string {
  let m = /^mcp__plugin_(.+?)_[^_]+__(.+)$/.exec(name);
  if (m) return `${m[1]}.${m[2]}`;
  m = /^mcp__(.+?)__(.+)$/.exec(name);
  if (m) return `${m[1]}.${m[2]}`;
  m = /^@?(?:powers?|mcp)[/_.:]([^/_.:]+)[/_.:](.+)$/i.exec(name);
  if (m) return `${m[1]}.${m[2]}`;
  m = /^([A-Za-z0-9-]+)___(.+)$/.exec(name);
  if (m) return `${m[1]}.${m[2]}`;
  return name;
}

export function bubbleText(a: AgentState): string {
  if (a.currentTool) return `${shortToolName(a.currentTool.name)}${a.currentTool.summary ? ` ${a.currentTool.summary}` : ''}`;
  switch (a.status) {
    case 'waiting':
      return '¿Me necesitas?';
    case 'done':
      return 'Listo';
    case 'error':
      return a.lastTool ? `${shortToolName(a.lastTool.name)} falló` : 'Error';
    case 'stale':
      return 'zzz…';
    default:
      return 'pensando…';
  }
}

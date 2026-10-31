export type Platform = 'claude' | 'kiro';
export type Surface = 'cli' | 'ide' | 'vscode' | 'unknown';
export type HookPlatform = 'claude' | 'kiro-cli' | 'kiro-ide';

export type EventType =
  | 'session.start'
  | 'session.end'
  | 'prompt'
  | 'tool.start'
  | 'tool.end'
  | 'subagent.start'
  | 'subagent.end'
  | 'waiting'
  | 'unparsed';

export type ToolKind = 'builtin' | 'mcp' | 'power' | 'plugin';

export interface ToolInfo {
  name: string;
  kind: ToolKind;
  source?: string;
  callId?: string;
  summary?: string;
  ok?: boolean;
  durationMs?: number;
}

export interface AgentEvent {
  id: string;
  ts: number;
  platform: Platform;
  surface: Surface;
  sessionId: string;
  agentId: string;
  parentAgentId?: string;
  /** Platform-provided subagent id (Claude `agent_id`), resolved by the server pipeline. */
  externalAgentId?: string;
  type: EventType;
  cwd?: string;
  text?: string;
  tool?: ToolInfo;
  subagent?: { name: string; description?: string };
  raw?: string;
}

export type AgentStatus = 'working' | 'waiting' | 'error' | 'done' | 'stale';

export interface AgentState {
  id: string;
  sessionId: string;
  parentId?: string;
  platform: Platform;
  surface: Surface;
  name: string;
  title?: string;
  cwd?: string;
  status: AgentStatus;
  currentTool?: ToolInfo & { startedAt: number };
  lastTool?: ToolInfo;
  extensions: string[];
  toolCount: number;
  startedAt: number;
  lastEventAt: number;
  endedAt?: number;
  children: string[];
}

export interface HookEnvelope {
  v: 1;
  platform: HookPlatform;
  eventHint?: string;
  receivedAt: number;
  cwd?: string;
  ppid?: number;
  pid?: number;
  envHints?: Record<string, string>;
  payload: unknown | null;
  payloadText?: string;
}

export type WsMessage =
  | { type: 'snapshot'; agents: AgentState[] }
  | { type: 'event'; event: AgentEvent; agents: AgentState[] };

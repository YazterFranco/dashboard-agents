import { randomUUID } from 'node:crypto';
import {
  RAW_MAX_BYTES,
  TEXT_MAX,
  classifyTool,
  redact,
  summarizeToolInput,
  truncate,
  type AgentEvent,
  type HookEnvelope,
  type Platform,
  type Surface,
  type ToolInfo,
} from '@agentdash/shared';

export type Payload = Record<string, unknown>;

export function asPayload(x: unknown): Payload | null {
  return x !== null && typeof x === 'object' && !Array.isArray(x) ? (x as Payload) : null;
}

export function str(x: unknown): string | undefined {
  return typeof x === 'string' && x !== '' ? x : undefined;
}

/** Lowercase letters only: "PreToolUse", "preToolUse" and "pre_tool_use" all become "pretooluse". */
export function normEvent(name: string | undefined): string {
  return (name ?? '').toLowerCase().replace(/[^a-z]/g, '');
}

export function platformOf(env: HookEnvelope): Platform {
  return env.platform === 'claude' ? 'claude' : 'kiro';
}

export function surfaceOf(env: HookEnvelope): Surface {
  if (env.platform === 'kiro-ide') return 'ide';
  if (env.platform === 'kiro-cli') return 'cli';
  const hints = env.envHints ?? {};
  if ((hints.CLAUDE_CODE_ENTRYPOINT ?? '').includes('vscode') || hints.TERM_PROGRAM === 'vscode') return 'vscode';
  return 'cli';
}

export function sessionIdFor(env: HookEnvelope): string {
  const p = asPayload(env.payload);
  const explicit = str(p?.session_id) ?? str(p?.sessionId);
  if (explicit) return explicit;
  // ppid is NOT stable: hooks often run under a fresh `sh -c`, so each event would get its own
  // parent. The hook reports sessionPid (first non-shell ancestor); without it, group by folder.
  const cwd = str(p?.cwd) ?? env.cwd ?? '';
  const prefix = env.platform === 'claude' ? 'claude' : `kiro:${surfaceOf(env)}`;
  return env.sessionPid ? `${prefix}:${env.sessionPid}:${cwd}` : `${prefix}:${cwd}`;
}

export function makeRaw(env: HookEnvelope): string {
  const src = env.payload ?? env.payloadText ?? null;
  const text = JSON.stringify(src) ?? 'null';
  return truncate(redact(text.slice(0, RAW_MAX_BYTES * 2)), RAW_MAX_BYTES);
}

export function cleanText(x: unknown): string | undefined {
  const s = str(x);
  return s === undefined ? undefined : truncate(redact(s), TEXT_MAX);
}

export function baseEvent(env: HookEnvelope, type: AgentEvent['type'], extra: Partial<AgentEvent> = {}): AgentEvent {
  const p = asPayload(env.payload);
  const sessionId = sessionIdFor(env);
  return {
    id: randomUUID(),
    ts: env.receivedAt,
    platform: platformOf(env),
    surface: surfaceOf(env),
    sessionId,
    agentId: sessionId,
    type,
    cwd: str(p?.cwd) ?? env.cwd,
    raw: makeRaw(env),
    ...extra,
  };
}

export function unparsedEvent(env: HookEnvelope, reason: string): AgentEvent {
  return baseEvent(env, 'unparsed', { text: truncate(reason, TEXT_MAX) });
}

export function toolOk(resp: unknown): boolean {
  const r = asPayload(resp);
  if (!r) return true;
  if (r.is_error === true || r.isError === true || r.success === false) return false;
  if (r.error !== undefined && r.error !== null && r.error !== false && r.error !== '') return false;
  for (const k of ['exitCode', 'exit_code', 'exit_status', 'exitStatus']) {
    if (typeof r[k] === 'number' && r[k] !== 0) return false;
  }
  return true;
}

export function toolFrom(p: Payload | null, phase: 'start' | 'end'): ToolInfo {
  const name = str(p?.tool_name) ?? str(p?.toolName) ?? 'desconocida';
  const tool: ToolInfo = { name, ...classifyTool(name) };
  const callId = str(p?.tool_use_id) ?? str(p?.toolUseId);
  if (callId) tool.callId = callId;
  const summary = summarizeToolInput(name, p?.tool_input ?? p?.toolInput);
  if (summary) tool.summary = summary;
  if (phase === 'end') tool.ok = toolOk(p?.tool_response ?? p?.toolResponse);
  return tool;
}

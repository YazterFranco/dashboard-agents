import type { AgentEvent, HookEnvelope } from '@agentdash/shared';
import { asPayload, baseEvent, cleanText, normEvent, str, toolFrom, unparsedEvent } from './common.js';

const SUBAGENT_TOOLS = new Set(['Task', 'Agent']);

export function adaptClaude(env: HookEnvelope): AgentEvent[] {
  const p = asPayload(env.payload);
  if (!p) return [unparsedEvent(env, 'payload de Claude vacío o no es JSON')];
  const externalAgentId = str(p.agent_id);
  const ev = (type: AgentEvent['type'], extra: Partial<AgentEvent> = {}) =>
    baseEvent(env, type, { ...(externalAgentId ? { externalAgentId } : {}), ...extra });

  switch (normEvent(str(p.hook_event_name))) {
    case 'sessionstart':
      return [ev('session.start', { text: cleanText(p.source) })];
    case 'sessionend':
      return [ev('session.end', { text: cleanText(p.reason) })];
    case 'userpromptsubmit':
      return [ev('prompt', { text: cleanText(p.prompt) })];
    case 'notification':
      return [ev('waiting', { text: cleanText(p.message) })];
    case 'stop':
      return [ev('waiting')];
    case 'pretooluse': {
      const tool = toolFrom(p, 'start');
      const start = ev('tool.start', { tool });
      if (!SUBAGENT_TOOLS.has(tool.name)) return [start];
      const input = asPayload(p.tool_input);
      const description = str(input?.description);
      const child = ev('subagent.start', {
        agentId: `${start.sessionId}:${tool.callId ?? start.id}`,
        parentAgentId: start.sessionId,
        subagent: { name: str(input?.subagent_type) ?? description ?? 'subagente', ...(description ? { description } : {}) },
      });
      return [start, child];
    }
    case 'posttooluse':
    case 'posttoolusefailure': {
      const tool = toolFrom(p, 'end');
      if (normEvent(str(p.hook_event_name)) === 'posttoolusefailure') tool.ok = false;
      const end = ev('tool.end', { tool });
      if (!SUBAGENT_TOOLS.has(tool.name) || !tool.callId) return [end];
      return [end, ev('subagent.end', { agentId: `${end.sessionId}:${tool.callId}`, parentAgentId: end.sessionId })];
    }
    case 'subagentstart': {
      const sessionId = baseEvent(env, 'subagent.start').sessionId;
      const name = str(p.agent_type) ?? 'subagente';
      return [ev('subagent.start', { agentId: `${sessionId}:${externalAgentId ?? 'sub'}`, parentAgentId: sessionId, subagent: { name } })];
    }
    case 'subagentstop':
      return [ev('subagent.end')];
    default:
      return [unparsedEvent(env, `evento de Claude no reconocido: ${str(p.hook_event_name) ?? '(sin nombre)'}`)];
  }
}

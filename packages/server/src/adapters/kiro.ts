import type { AgentEvent, HookEnvelope } from '@agentdash/shared';
import { asPayload, baseEvent, cleanText, normEvent, str, toolFrom, unparsedEvent } from './common.js';

export function adaptKiro(env: HookEnvelope): AgentEvent[] {
  const p = asPayload(env.payload);
  const name = str(p?.hook_event_name) ?? str(p?.hookEventName) ?? env.eventHint;
  if (!name) return [unparsedEvent(env, 'evento de Kiro sin nombre ni pista')];

  switch (normEvent(name)) {
    case 'agentspawn':
    case 'sessionstart':
      return [baseEvent(env, 'session.start')];
    case 'userpromptsubmit':
    case 'promptsubmit':
      return [baseEvent(env, 'prompt', { text: cleanText(p?.prompt) })];
    case 'pretooluse':
      return [baseEvent(env, 'tool.start', { tool: toolFrom(p, 'start') })];
    case 'posttooluse':
      return [baseEvent(env, 'tool.end', { tool: toolFrom(p, 'end') })];
    case 'stop':
    case 'agentstop':
      return [baseEvent(env, 'waiting')];
    case 'posttaskexecution':
      return [baseEvent(env, 'waiting', { text: 'tarea de spec completada' })];
    case 'sessionend':
      return [baseEvent(env, 'session.end')];
    default:
      return [unparsedEvent(env, `evento de Kiro no reconocido: ${name}`)];
  }
}

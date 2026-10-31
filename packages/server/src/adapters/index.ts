import type { AgentEvent, HookEnvelope } from '@agentdash/shared';
import { adaptClaude } from './claude.js';
import { adaptKiro } from './kiro.js';
import { unparsedEvent } from './common.js';

export { sessionIdFor } from './common.js';

/** Normalizes one hook envelope. Never throws: failures become an `unparsed` event. */
export function adapt(env: HookEnvelope): AgentEvent[] {
  try {
    return env.platform === 'claude' ? adaptClaude(env) : adaptKiro(env);
  } catch (err) {
    return [unparsedEvent(env, `error del adaptador: ${(err as Error).message}`)];
  }
}

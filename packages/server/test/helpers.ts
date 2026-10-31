import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { HookEnvelope } from '@agentdash/shared';

export function load(name: string): HookEnvelope {
  const path = fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8')) as HookEnvelope;
}

export function withPayload(env: HookEnvelope, patch: Record<string, unknown>): HookEnvelope {
  return { ...env, payload: { ...(env.payload as Record<string, unknown>), ...patch } };
}

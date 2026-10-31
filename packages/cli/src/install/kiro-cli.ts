import { isOurCommand } from '../paths.js';
import { isObject, type Json } from './json.js';

export const KIRO_CLI_EVENTS = ['agentSpawn', 'userPromptSubmit', 'preToolUse', 'postToolUse', 'stop'] as const;
const WITH_MATCHER = new Set<string>(['preToolUse', 'postToolUse']);

type Entry = { command?: unknown; matcher?: string } & Json;

export function addKiroCliHooks(agent: Json, cmd: string): Json {
  const out = structuredClone(agent);
  const hooks: Json = isObject(out.hooks) ? out.hooks : {};
  for (const event of KIRO_CLI_EVENTS) {
    const entries: Entry[] = Array.isArray(hooks[event]) ? (hooks[event] as Entry[]) : [];
    const ours = entries.filter((e) => isOurCommand(e?.command));
    if (ours.length) for (const e of ours) e.command = cmd;
    else entries.push(WITH_MATCHER.has(event) ? { matcher: '*', command: cmd } : { command: cmd });
    hooks[event] = entries;
  }
  out.hooks = hooks;
  return out;
}

export function removeKiroCliHooks(agent: Json): Json {
  const out = structuredClone(agent);
  if (!isObject(out.hooks)) return out;
  const hooks = out.hooks;
  for (const event of Object.keys(hooks)) {
    if (!Array.isArray(hooks[event])) continue;
    const kept = (hooks[event] as Entry[]).filter((e) => !isOurCommand(e?.command));
    if (kept.length) hooks[event] = kept;
    else delete hooks[event];
  }
  if (Object.keys(hooks).length === 0) delete out.hooks;
  return out;
}

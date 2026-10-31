import { isOurCommand } from '../paths.js';
import { isObject, type Json } from './json.js';

export const CLAUDE_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'Notification',
  'Stop',
  'SubagentStop',
  'SessionEnd',
] as const;
const WITH_MATCHER = new Set<string>(['PreToolUse', 'PostToolUse', 'PostToolUseFailure']);

type Group = { matcher?: string; hooks?: Array<Json> } & Json;

function groupsOf(hooks: Json, event: string): Group[] {
  return Array.isArray(hooks[event]) ? (hooks[event] as Group[]) : [];
}

function hasOurs(group: Group): boolean {
  return Array.isArray(group.hooks) && group.hooks.some((h) => isOurCommand(h?.command));
}

export function addClaudeHooks(settings: Json, cmd: string): Json {
  const out = structuredClone(settings);
  const hooks: Json = isObject(out.hooks) ? out.hooks : {};
  for (const event of CLAUDE_EVENTS) {
    const groups = groupsOf(hooks, event);
    const ours = groups.filter(hasOurs);
    if (ours.length) {
      for (const g of ours) for (const h of g.hooks!) if (isOurCommand(h.command)) h.command = cmd;
    } else {
      const entry = { type: 'command', command: cmd, timeout: 5 };
      groups.push(WITH_MATCHER.has(event) ? { matcher: '*', hooks: [entry] } : { hooks: [entry] });
    }
    hooks[event] = groups;
  }
  out.hooks = hooks;
  return out;
}

export function removeClaudeHooks(settings: Json): Json {
  const out = structuredClone(settings);
  if (!isObject(out.hooks)) return out;
  const hooks = out.hooks;
  for (const event of Object.keys(hooks)) {
    const kept = groupsOf(hooks, event)
      .map((g) => (Array.isArray(g.hooks) ? { ...g, hooks: g.hooks.filter((h) => !isOurCommand(h?.command)) } : g))
      .filter((g) => !Array.isArray(g.hooks) || g.hooks.length > 0);
    if (kept.length) hooks[event] = kept;
    else delete hooks[event];
  }
  if (Object.keys(hooks).length === 0) delete out.hooks;
  return out;
}

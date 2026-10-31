import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { HookPlatform } from '@agentdash/shared';

/** Every command we install contains this marker; it is how we recognize our own entries. */
export const HOOK_MARKER = '.agentdash/hook.mjs';

export function agentdashHome(home: string): string {
  return join(home, '.agentdash');
}

export function hookPath(home: string): string {
  return join(agentdashHome(home), 'hook.mjs');
}

export function hookCommand(home: string, platform: HookPlatform, eventHint?: string): string {
  return `node "${hookPath(home)}" ${platform}${eventHint ? ` ${eventHint}` : ''}`;
}

export function isOurCommand(cmd: unknown): boolean {
  return typeof cmd === 'string' && cmd.replace(/\\/g, '/').includes(HOOK_MARKER);
}

/** Copies the hook script to a stable location (~/.agentdash/hook.mjs) and returns its path. */
export function installHookFile(home: string, source: string): string {
  const dest = hookPath(home);
  mkdirSync(agentdashHome(home), { recursive: true });
  copyFileSync(source, dest);
  return dest;
}

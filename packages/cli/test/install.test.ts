import { beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hookCommand } from '../src/paths.js';
import { addClaudeHooks, removeClaudeHooks } from '../src/install/claude.js';
import { addKiroCliHooks, removeKiroCliHooks } from '../src/install/kiro-cli.js';
import { kiroIdeHookFiles } from '../src/install/kiro-ide.js';
import { install, uninstall } from '../src/install/index.js';

const hookSource = fileURLToPath(new URL('../hook/hook.mjs', import.meta.url));
const CMD = 'node "/h/.agentdash/hook.mjs" claude';
const CMD_K = 'node "/h/.agentdash/hook.mjs" kiro-cli';
const userGroup = { matcher: 'Bash', hooks: [{ type: 'command', command: 'mine.sh' }] };
let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'agentdash-home-'));
});
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

describe('hookCommand', () => {
  it('quotes the hook path so homes with spaces work', () => {
    expect(hookCommand('/Users/Juan Pérez', 'claude')).toBe('node "/Users/Juan Pérez/.agentdash/hook.mjs" claude');
    expect(hookCommand('/h', 'kiro-ide', 'PreToolUse')).toBe('node "/h/.agentdash/hook.mjs" kiro-ide PreToolUse');
  });
});

describe('Claude hooks', () => {
  const settings = { hooks: { PreToolUse: [userGroup] }, model: 'x' };

  it('adds one entry per event and keeps foreign settings and hooks', () => {
    const s = addClaudeHooks(settings, CMD) as any;
    expect(s.model).toBe('x');
    expect(s.hooks.PreToolUse).toHaveLength(2);
    expect(s.hooks.PreToolUse[0]).toEqual(userGroup);
    expect(s.hooks.PreToolUse[1]).toEqual({ matcher: '*', hooks: [{ type: 'command', command: CMD, timeout: 5 }] });
    expect(s.hooks.Stop[0]).toEqual({ hooks: [{ type: 'command', command: CMD, timeout: 5 }] });
    expect(Object.keys(s.hooks).sort()).toEqual(['Notification', 'PostToolUse', 'PostToolUseFailure', 'PreToolUse', 'SessionEnd', 'SessionStart', 'Stop', 'SubagentStop', 'UserPromptSubmit']);
  });

  it('is idempotent and refreshes our command in place', () => {
    const s = addClaudeHooks(settings, CMD);
    expect(addClaudeHooks(s, CMD)).toEqual(s);
    const moved = addClaudeHooks(s, 'node "/new/.agentdash/hook.mjs" claude') as any;
    expect(moved.hooks.Stop).toHaveLength(1);
    expect(moved.hooks.Stop[0].hooks[0].command).toContain('/new/');
  });

  it('removes only our entries', () => {
    const s = removeClaudeHooks(addClaudeHooks(settings, CMD)) as any;
    expect(s.hooks).toEqual({ PreToolUse: [userGroup] });
    expect(s.model).toBe('x');
  });

  it('does not mutate its input', () => {
    const copy = structuredClone(settings);
    addClaudeHooks(settings, CMD);
    expect(settings).toEqual(copy);
  });
});

describe('Kiro CLI hooks', () => {
  it('adds the v2 hook block', () => {
    const k = addKiroCliHooks({ name: 'dev', tools: ['*'] }, CMD_K) as any;
    expect(k.name).toBe('dev');
    expect(Object.keys(k.hooks)).toEqual(['agentSpawn', 'userPromptSubmit', 'preToolUse', 'postToolUse', 'stop']);
    expect(k.hooks.preToolUse[0]).toEqual({ matcher: '*', command: CMD_K });
    expect(k.hooks.stop[0]).toEqual({ command: CMD_K });
    expect(addKiroCliHooks(k, CMD_K)).toEqual(k);
  });
  it('removes only our entries', () => {
    const k = addKiroCliHooks({ name: 'dev', hooks: { stop: [{ command: 'say done' }] } }, CMD_K);
    expect(removeKiroCliHooks(k)).toEqual({ name: 'dev', hooks: { stop: [{ command: 'say done' }] } });
  });
});

describe('Kiro IDE hook files', () => {
  it('produces one v1 command hook per event with the event as argument', () => {
    const files = kiroIdeHookFiles(home) as Record<string, any>;
    expect(Object.keys(files)).toEqual(['agentdash-pre-tool.json', 'agentdash-post-tool.json', 'agentdash-agent-stop.json', 'agentdash-prompt.json']);
    expect(files['agentdash-pre-tool.json']).toMatchObject({ version: 'v1', trigger: 'PreToolUse', matcher: '*', action: { type: 'command', command: expect.stringContaining('kiro-ide PreToolUse') } });
    expect(files['agentdash-agent-stop.json']).toMatchObject({ trigger: 'AgentStop', action: { command: expect.stringContaining('kiro-ide AgentStop') } });
    expect(files['agentdash-agent-stop.json'].matcher).toBeUndefined();
  });
});

describe('install / uninstall', () => {
  it('installs Claude hooks, copies the hook and backs up existing settings', async () => {
    const path = join(home, '.claude', 'settings.json');
    mkdirSync(join(home, '.claude'));
    writeFileSync(path, JSON.stringify({ theme: 'dark' }));
    const r = await install('claude', { home, hookSource });
    expect(r.written).toContain(path);
    expect(existsSync(join(home, '.agentdash', 'hook.mjs'))).toBe(true);
    expect(read(path).theme).toBe('dark');
    expect(read(path).hooks.Stop[0].hooks[0].command).toContain('.agentdash');
    expect(read(path + '.bak')).toEqual({ theme: 'dark' });
    await uninstall('claude', { home, hookSource });
    expect(read(path)).toEqual({ theme: 'dark' });
  });

  it('creates Claude settings when none exist', async () => {
    await install('claude', { home, hookSource });
    expect(read(join(home, '.claude', 'settings.json')).hooks.SessionStart).toHaveLength(1);
  });

  it('refuses to overwrite invalid JSON', async () => {
    const path = join(home, '.claude', 'settings.json');
    mkdirSync(join(home, '.claude'));
    writeFileSync(path, '{ roto');
    await expect(install('claude', { home, hookSource })).rejects.toThrow(/JSON/);
    expect(readFileSync(path, 'utf8')).toBe('{ roto');
  });

  it('prints a snippet without writing anything', async () => {
    const r = await install('claude', { home, hookSource, print: true });
    expect(r.written).toEqual([]);
    expect(JSON.parse(r.printed!).hooks.PreToolUse).toHaveLength(1);
    expect(existsSync(join(home, '.claude'))).toBe(false);
    expect(existsSync(join(home, '.agentdash'))).toBe(false);
  });

  it('installs into the only Kiro CLI agent', async () => {
    const dir = join(home, '.kiro', 'agents');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'dev.json'), JSON.stringify({ name: 'dev' }));
    await install('kiro-cli', { home, hookSource });
    expect(read(join(dir, 'dev.json')).hooks.preToolUse[0].command).toContain('kiro-cli');
  });

  it('asks which Kiro CLI agent to use when there are several', async () => {
    const dir = join(home, '.kiro', 'agents');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'dev.json'), '{}');
    writeFileSync(join(dir, 'ops.json'), '{}');
    await expect(install('kiro-cli', { home, hookSource })).rejects.toThrow(/dev.*ops/);
    await install('kiro-cli', { home, hookSource, agent: 'ops' });
    expect(read(join(dir, 'ops.json')).hooks).toBeDefined();
    expect(read(join(dir, 'dev.json')).hooks).toBeUndefined();
  });

  it('writes and removes Kiro IDE hook files in a workspace', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'agentdash-ws-'));
    const r = await install('kiro-ide', { home, hookSource, workspace: ws });
    expect(r.written.filter((p) => p.startsWith(ws))).toHaveLength(4);
    expect(existsSync(join(ws, '.kiro', 'hooks', 'agentdash-pre-tool.json'))).toBe(true);
    writeFileSync(join(ws, '.kiro', 'hooks', 'mine.json'), '{}');
    await uninstall('kiro-ide', { home, hookSource, workspace: ws });
    expect(existsSync(join(ws, '.kiro', 'hooks', 'agentdash-pre-tool.json'))).toBe(false);
    expect(existsSync(join(ws, '.kiro', 'hooks', 'mine.json'))).toBe(true);
  });
});

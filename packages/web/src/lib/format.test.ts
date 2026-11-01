import { describe, expect, it } from 'vitest';
import { clock, elapsed, platformLabel } from './format';
import { agent } from './fixtures';

describe('format', () => {
  it('formats elapsed time', () => {
    expect(elapsed(252_000)).toBe('4m 12s');
    expect(elapsed(245_000)).toBe('4m 05s');
    expect(elapsed(48_000)).toBe('48s');
    expect(elapsed(3_780_000)).toBe('1h 03m');
    expect(elapsed(-5)).toBe('0s');
  });
  it('formats a time of day', () => {
    expect(clock(new Date(2026, 9, 31, 21, 4, 12).getTime())).toBe('21:04:12');
  });
  it('labels platform and surface', () => {
    expect(platformLabel(agent('a'))).toBe('Claude Code · CLI');
    expect(platformLabel(agent('a', 'working', 1, { surface: 'vscode' }))).toBe('Claude Code · VS Code');
    expect(platformLabel(agent('a', 'working', 1, { platform: 'kiro', surface: 'ide' }))).toBe('Kiro IDE');
    expect(platformLabel(agent('a', 'working', 1, { platform: 'kiro', surface: 'cli' }))).toBe('Kiro CLI');
    expect(platformLabel(agent('a', 'working', 1, { parentId: 'p' }))).toBe('Claude Code · subagente');
  });
});

import { duration, shortToolName } from './format';

describe('shortToolName', () => {
  it('shortens MCP, plugin and power tool names', () => {
    expect(shortToolName('mcp__github__create_issue')).toBe('github.create_issue');
    expect(shortToolName('mcp__plugin_code-review_github__list')).toBe('code-review.list');
    expect(shortToolName('@powers/stripe/search_docs')).toBe('stripe.search_docs');
    expect(shortToolName('stripe___search_docs')).toBe('stripe.search_docs');
    expect(shortToolName('Edit')).toBe('Edit');
  });
});

describe('duration', () => {
  it('formats tool durations', () => {
    expect(duration(850)).toBe('850ms');
    expect(duration(1200)).toBe('1.2s');
    expect(duration(75_000)).toBe('1m 15s');
  });
});

import { bubbleText } from './format';

describe('bubbleText', () => {
  it('shows the running tool first', () => {
    expect(bubbleText(agent('a', 'working', 1, { currentTool: { name: 'mcp__github__list', kind: 'mcp', summary: 'acme/api', startedAt: 0 } }))).toBe('github.list acme/api');
  });
  it('falls back to the status', () => {
    expect(bubbleText(agent('a', 'waiting'))).toBe('¿Me necesitas?');
    expect(bubbleText(agent('a', 'done'))).toBe('Listo');
    expect(bubbleText(agent('a', 'error', 1, { lastTool: { name: 'execute_bash', kind: 'builtin', ok: false } }))).toBe('execute_bash falló');
    expect(bubbleText(agent('a', 'stale'))).toBe('zzz…');
    expect(bubbleText(agent('a', 'working'))).toBe('pensando…');
  });
});

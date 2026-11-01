import { describe, expect, it } from 'vitest';
import { classifyTool, extensionLabel, summarizeToolInput } from '@agentdash/shared';

describe('classifyTool', () => {
  it('treats plain tool names as builtin', () => {
    expect(classifyTool('Edit')).toEqual({ kind: 'builtin' });
    expect(classifyTool('fs_write')).toEqual({ kind: 'builtin' });
  });
  it('detects Claude MCP tools and their server', () => {
    expect(classifyTool('mcp__github__create_issue')).toEqual({ kind: 'mcp', source: 'github' });
  });
  it('detects Claude plugin MCP tools and their plugin', () => {
    expect(classifyTool('mcp__plugin_code-review_github__list')).toEqual({ kind: 'plugin', source: 'code-review' });
  });
  it('detects Kiro power tools in their known shapes', () => {
    expect(classifyTool('@powers/stripe/search_docs')).toEqual({ kind: 'power', source: 'stripe' });
    expect(classifyTool('stripe___search_docs')).toEqual({ kind: 'power', source: 'stripe' });
  });
  it('detects Kiro MCP tools', () => {
    expect(classifyTool('@mcp/github/list_prs')).toEqual({ kind: 'mcp', source: 'github' });
  });
});

describe('summarizeToolInput', () => {
  it('prefers the most descriptive known key', () => {
    expect(summarizeToolInput('Edit', { file_path: 'src/a.ts', old_string: 'x' })).toBe('src/a.ts');
    expect(summarizeToolInput('Bash', { command: 'npm test' })).toBe('npm test');
    expect(summarizeToolInput('Task', { description: 'run tests', subagent_type: 'test-runner' })).toBe('run tests');
  });
  it('falls back to the first keys and caps at 120 chars', () => {
    expect(summarizeToolInput('x', { a: 'y'.repeat(500) })!.length).toBeLessThanOrEqual(120);
    expect(summarizeToolInput('x', { a: 1, b: 'two', c: 3 })).toBe('a=1 b=two');
  });
  it('returns undefined for missing input', () => {
    expect(summarizeToolInput('x', undefined)).toBeUndefined();
  });
  it('redacts secrets inside the summary', () => {
    expect(summarizeToolInput('Bash', { command: 'curl -H "Authorization: Bearer abc.def.ghi"' })).toContain('«redactado»');
  });
});

describe('extensionLabel', () => {
  it('labels non-builtin tools', () => {
    expect(extensionLabel({ kind: 'power', source: 'stripe' })).toBe('power: stripe');
    expect(extensionLabel({ kind: 'mcp', source: 'github' })).toBe('mcp: github');
    expect(extensionLabel({ kind: 'plugin', source: 'code-review' })).toBe('plugin: code-review');
    expect(extensionLabel({ kind: 'builtin' })).toBeUndefined();
  });
});

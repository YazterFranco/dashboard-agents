import { describe, expect, it } from 'vitest';
import { adapt } from '../src/adapters/index.js';
import { load, withPayload } from './helpers.js';

describe('adapt — Claude', () => {
  it('maps PreToolUse to tool.start with classification and summary', () => {
    const [e] = adapt(load('claude/pre-edit'));
    expect(e).toMatchObject({
      platform: 'claude', surface: 'cli', type: 'tool.start', sessionId: 'sess-1', agentId: 'sess-1', cwd: '/home/u/api',
      tool: { name: 'Edit', kind: 'builtin', callId: 'tu-1', summary: 'src/auth/session.ts' },
    });
    expect(typeof e.id).toBe('string');
    expect(e.ts).toBe(load('claude/pre-edit').receivedAt);
  });
  it('marks failed tools as ok=false', () => {
    expect(adapt(load('claude/post-bash-error'))[0].tool!.ok).toBe(false);
    expect(adapt(load('claude/post-edit'))[0].tool!.ok).toBe(true);
  });
  it('treats PostToolUseFailure as a failed tool.end', () => {
    const [e] = adapt(withPayload(load('claude/post-edit'), { hook_event_name: 'PostToolUseFailure', error: 'boom' }));
    expect(e).toMatchObject({ type: 'tool.end', tool: { ok: false } });
  });
  it('opens a subagent on Task PreToolUse', () => {
    const events = adapt(load('claude/pre-task'));
    expect(events.map((x) => x.type)).toEqual(['tool.start', 'subagent.start']);
    expect(events[1]).toMatchObject({ agentId: 'sess-1:tu-task', parentAgentId: 'sess-1', subagent: { name: 'test-runner', description: 'run auth tests' } });
  });
  it('also opens a subagent for the newer Agent tool name', () => {
    const events = adapt(withPayload(load('claude/pre-task'), { tool_name: 'Agent' }));
    expect(events.map((x) => x.type)).toEqual(['tool.start', 'subagent.start']);
  });
  it('closes the subagent on Task PostToolUse', () => {
    const events = adapt(load('claude/post-task'));
    expect(events.map((x) => x.type)).toEqual(['tool.end', 'subagent.end']);
    expect(events[1].agentId).toBe('sess-1:tu-task');
  });
  it('classifies MCP tools', () => {
    expect(adapt(load('claude/pre-mcp'))[0].tool).toMatchObject({ kind: 'mcp', source: 'github' });
  });
  it('maps Stop and Notification to waiting', () => {
    expect(adapt(load('claude/stop'))[0].type).toBe('waiting');
    expect(adapt(load('claude/notification'))[0]).toMatchObject({ type: 'waiting', text: 'Claude needs your permission to use Bash' });
  });
  it('maps session lifecycle and prompts', () => {
    expect(adapt(load('claude/session-start'))[0]).toMatchObject({ type: 'session.start', text: 'startup' });
    expect(adapt(load('claude/session-end'))[0]).toMatchObject({ type: 'session.end', text: 'prompt_input_exit' });
    expect(adapt(load('claude/prompt'))[0]).toMatchObject({ type: 'prompt', text: 'refactoriza auth para usar verifySession()' });
  });
  it('maps SubagentStop to subagent.end carrying the external agent id', () => {
    expect(adapt(load('claude/subagent-stop'))[0]).toMatchObject({ type: 'subagent.end', externalAgentId: 'agent-7', agentId: 'sess-1' });
  });
  it('carries agent_id of tools run inside a subagent', () => {
    expect(adapt(load('claude/tool-in-subagent'))[0].externalAgentId).toBe('agent-7');
  });
  it('keeps two sessions in the same folder apart', () => {
    const other = adapt(withPayload(load('claude/pre-edit'), { session_id: 'sess-2' }))[0];
    expect(other.agentId).toBe('sess-2');
    expect(other.sessionId).toBe('sess-2');
  });
  it('detects the VS Code surface from env hints', () => {
    expect(adapt({ ...load('claude/pre-edit'), envHints: { TERM_PROGRAM: 'vscode' } })[0].surface).toBe('vscode');
    expect(adapt({ ...load('claude/pre-edit'), envHints: { CLAUDE_CODE_ENTRYPOINT: 'claude-vscode' } })[0].surface).toBe('vscode');
  });
  it('stores a redacted raw payload capped at 8 KB', () => {
    const big = withPayload(load('claude/pre-edit'), { tool_input: { file_path: 'a', content: 'x'.repeat(50_000) + ' sk-ant-abcdefghijklmnop' } });
    const [e] = adapt(big);
    expect(e.raw!.length).toBeLessThanOrEqual(8192);
    expect(adapt(withPayload(load('claude/pre-edit'), { tool_input: { command: 'export TOKEN=sk-ant-abcdefghijklmnop' } }))[0].raw).not.toContain('sk-ant-abcdefghijklmnop');
  });
});

describe('adapt — Kiro', () => {
  it('maps CLI v2 preToolUse with a ppid+cwd session id', () => {
    expect(adapt(load('kiro-cli/pre-tool'))[0]).toMatchObject({
      platform: 'kiro', surface: 'cli', type: 'tool.start', sessionId: 'kiro:cli:4242:/home/u/shop', agentId: 'kiro:cli:4242:/home/u/shop',
      tool: { name: 'fs_read', kind: 'builtin', summary: 'src/webhooks.ts' },
    });
  });
  it('uses session_id when Kiro sends one', () => {
    expect(adapt(withPayload(load('kiro-cli/pre-tool'), { session_id: 'k-1' }))[0].sessionId).toBe('k-1');
  });
  it('accepts v3 PascalCase event names', () => {
    expect(adapt(load('kiro-cli/v3-pre-tool'))[0].type).toBe('tool.start');
  });
  it('labels power tools', () => {
    expect(adapt(load('kiro-cli/pre-power'))[0].tool).toMatchObject({ kind: 'power', source: 'stripe' });
  });
  it('maps lifecycle events', () => {
    expect(adapt(load('kiro-cli/agent-spawn'))[0].type).toBe('session.start');
    expect(adapt(load('kiro-cli/prompt'))[0]).toMatchObject({ type: 'prompt', text: 'busca en la doc de stripe cómo validar webhooks' });
    expect(adapt(load('kiro-cli/stop'))[0].type).toBe('waiting');
    expect(adapt(load('kiro-cli/post-tool'))[0]).toMatchObject({ type: 'tool.end', tool: { ok: true } });
  });
  it('marks a non-zero exit status as a failed tool', () => {
    expect(adapt(withPayload(load('kiro-cli/post-tool'), { tool_name: 'execute_bash', tool_response: { exit_status: 1 } }))[0].tool!.ok).toBe(false);
  });
  it('builds an event from the hint when the IDE sends no payload', () => {
    expect(adapt(load('kiro-ide/empty-pre-tool'))[0]).toMatchObject({
      platform: 'kiro', surface: 'ide', type: 'tool.start', sessionId: 'kiro:ide:777:/home/u/checkout', tool: { name: 'desconocida', kind: 'builtin' },
    });
  });
  it('uses the IDE payload when present', () => {
    expect(adapt(load('kiro-ide/pre-tool-with-payload'))[0].tool).toMatchObject({ name: 'fsWrite', summary: 'src/checkout/spec.md' });
  });
  it('keeps two Kiro processes in the same folder apart', () => {
    expect(adapt({ ...load('kiro-cli/pre-tool'), ppid: 9999 })[0].sessionId).not.toBe(adapt(load('kiro-cli/pre-tool'))[0].sessionId);
  });
});

describe('adapt — unknown input', () => {
  it('returns an unparsed event instead of throwing', () => {
    const [e] = adapt({ v: 1, platform: 'claude', receivedAt: 1, payload: { hook_event_name: 'Nuevo', session_id: 's' } });
    expect(e.type).toBe('unparsed');
    expect(e.raw).toContain('Nuevo');
  });
  it('handles a non-JSON payload text', () => {
    const [e] = adapt({ v: 1, platform: 'kiro-cli', receivedAt: 1, payload: null, payloadText: 'hello' });
    expect(e.type).toBe('unparsed');
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync, spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';

const HOOK = fileURLToPath(new URL('../hook/hook.mjs', import.meta.url));
const received: any[] = [];
let server: Server;
let url: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push(JSON.parse(body));
      res.writeHead(202).end('{}');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

// Async spawn so the in-process test server can answer while the hook runs.
function run(args: string[], input: string, env: Record<string, string> = {}) {
  return new Promise<{ status: number | null; stdout: string; ms: number }>((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [HOOK, ...args], { env: { PATH: process.env.PATH ?? '', AGENTDASH_URL: url, ...env } });
    let stdout = '';
    child.stdout.on('data', (c) => (stdout += c));
    child.on('close', (status) => resolve({ status, stdout, ms: Date.now() - started }));
    child.stdin.end(input);
  });
}

describe('hook.mjs', () => {
  it('forwards the payload as an envelope, silently, with exit 0', async () => {
    const r = await run(['claude'], '{"hook_event_name":"Stop","session_id":"s"}');
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
    const env = received.at(-1);
    expect(env).toMatchObject({ v: 1, platform: 'claude', payload: { session_id: 's' } });
    expect(typeof env.ppid).toBe('number');
    expect(typeof env.receivedAt).toBe('number');
    expect(typeof env.cwd).toBe('string');
  });

  it('passes the event hint and a null payload when stdin is empty', async () => {
    const r = await run(['kiro-ide', 'PreToolUse'], '');
    expect(r.status).toBe(0);
    expect(received.at(-1)).toMatchObject({ platform: 'kiro-ide', eventHint: 'PreToolUse', payload: null });
  });

  it('sends non-JSON stdin as capped payloadText', async () => {
    await run(['kiro-cli'], 'hola ' + 'x'.repeat(20_000));
    const env = received.at(-1);
    expect(env.payload).toBeNull();
    expect(env.payloadText.startsWith('hola')).toBe(true);
    expect(env.payloadText.length).toBeLessThanOrEqual(8192);
  });

  it('copies only whitelisted env hints', async () => {
    await run(['claude'], '{}', { TERM_PROGRAM: 'vscode', KIRO_TOKEN: 'secret', CLAUDE_CODE_ENTRYPOINT: 'cli' });
    const env = received.at(-1);
    expect(env.envHints).toEqual({ TERM_PROGRAM: 'vscode', CLAUDE_CODE_ENTRYPOINT: 'cli' });
    expect(JSON.stringify(env)).not.toContain('secret');
  });

  it('shrinks huge payloads but keeps them parseable', async () => {
    const big = JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 's', tool_name: 'Write', tool_input: { file_path: 'big.txt', content: 'x'.repeat(3_000_000) } });
    const r = await run(['claude'], big);
    expect(r.status).toBe(0);
    const env = received.at(-1);
    expect(env.payload.tool_input.file_path).toBe('big.txt');
    expect(env.payload.tool_input.content.length).toBeLessThanOrEqual(2001);
    expect(JSON.stringify(env).length).toBeLessThan(100_000);
  });

  it('exits 0 quickly and silently when the dashboard is down', async () => {
    const r = await run(['claude'], '{"hook_event_name":"Stop"}', { AGENTDASH_URL: 'http://127.0.0.1:1' });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
    expect(r.ms).toBeLessThan(2000);
  });

  it('reports the same sessionPid when each invocation goes through a new shell', async () => {
    const viaShell = () =>
      new Promise<void>((resolve) => {
        const child = spawn('sh', ['-c', `"${process.execPath}" "${HOOK}" kiro-cli`], { env: { PATH: process.env.PATH ?? '', AGENTDASH_URL: url } });
        child.on('close', () => resolve());
        child.stdin.end('{"hook_event_name":"stop"}');
      });
    await viaShell();
    const first = received.at(-1);
    await viaShell();
    const second = received.at(-1);
    expect(first.ppid).not.toBe(second.ppid);
    expect(first.sessionPid).toBe(process.pid);
    expect(second.sessionPid).toBe(process.pid);
  });

  it('exits 0 without sending for an unknown platform', async () => {
    const before = received.length;
    const r = await run(['otra'], '{}');
    expect(r.status).toBe(0);
    expect(received.length).toBe(before);
  });

  it('does not hang when stdin is never closed', () => {
    const r = spawnSync(process.execPath, [HOOK, 'kiro-ide', 'AgentStop'], {
      env: { PATH: process.env.PATH ?? '', AGENTDASH_URL: 'http://127.0.0.1:1' },
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 3000,
    });
    expect(r.status).toBe(0);
  });
});

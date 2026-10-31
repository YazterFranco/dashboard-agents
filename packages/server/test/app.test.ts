import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { WsMessage } from '@agentdash/shared';
import { buildApp, startServer } from '../src/app.js';
import { EventStore } from '../src/store.js';
import { load, withPayload } from './helpers.js';

const closers: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

async function makeApp() {
  const store = new EventStore(':memory:');
  const { app } = await buildApp({ store });
  closers.push(() => store.close(), () => app.close());
  return app;
}

describe('HTTP API', () => {
  it('ingests a valid envelope and exposes the agent', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/api/ingest', payload: load('claude/pre-edit') });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ accepted: 1 });
    const agents = (await app.inject({ method: 'GET', url: '/api/agents' })).json();
    expect(agents[0]).toMatchObject({ id: 'sess-1', status: 'working' });
  });

  it('rejects an invalid envelope with 400', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/api/ingest', payload: { v: 1, platform: 'nope' } });
    expect(res.statusCode).toBe(400);
  });

  it('returns an agent timeline newest first with a limit', async () => {
    const app = await makeApp();
    await app.inject({ method: 'POST', url: '/api/ingest', payload: load('claude/prompt') });
    await app.inject({ method: 'POST', url: '/api/ingest', payload: { ...load('claude/pre-edit'), receivedAt: load('claude/pre-edit').receivedAt + 10 } });
    const events = (await app.inject({ method: 'GET', url: '/api/agents/sess-1/events?limit=1' })).json();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('tool.start');
  });

  it('reports health', async () => {
    const app = await makeApp();
    await app.inject({ method: 'POST', url: '/api/ingest', payload: load('claude/prompt') });
    expect((await app.inject({ method: 'GET', url: '/api/health' })).json()).toMatchObject({ ok: true, agents: 1, events: 1 });
  });

  it('serves raw events for fixture export', async () => {
    const app = await makeApp();
    await app.inject({ method: 'POST', url: '/api/ingest', payload: load('kiro-cli/pre-power') });
    await app.inject({ method: 'POST', url: '/api/ingest', payload: load('claude/prompt') });
    const raw = (await app.inject({ method: 'GET', url: '/api/events/raw?platform=kiro&limit=5' })).json();
    expect(raw).toHaveLength(1);
    expect(raw[0].raw).toContain('@powers/stripe/search_docs');
  });

  it('accepts a large payload and keeps raw under 8 KB', async () => {
    const app = await makeApp();
    const big = withPayload(load('claude/pre-edit'), { tool_input: { file_path: 'big.txt', content: 'x'.repeat(900_000) } });
    expect((await app.inject({ method: 'POST', url: '/api/ingest', payload: big })).statusCode).toBe(202);
    const [ev] = (await app.inject({ method: 'GET', url: '/api/agents/sess-1/events' })).json();
    expect(ev.raw.length).toBeLessThanOrEqual(8192);
    expect(ev.tool.summary).toBe('big.txt');
  });
});

describe('WebSocket', () => {
  it('sends a snapshot then live events', async () => {
    const server = await startServer({ port: 0, dbPath: ':memory:' });
    closers.push(() => server.close());
    const ws = new WebSocket(server.url.replace('http', 'ws') + '/ws');
    closers.push(() => ws.close());
    const messages: WsMessage[] = [];
    const got = (n: number) =>
      new Promise<void>((resolve) => {
        const check = () => (messages.length >= n ? resolve() : setTimeout(check, 10));
        check();
      });
    ws.on('message', (data) => messages.push(JSON.parse(String(data))));
    await got(1);
    expect(messages[0]).toEqual({ type: 'snapshot', agents: [] });
    await fetch(server.url + '/api/ingest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(load('claude/prompt')) });
    await got(2);
    expect(messages[1]).toMatchObject({ type: 'event', event: { type: 'prompt' }, agents: [{ id: 'sess-1', status: 'working' }] });
  });
});

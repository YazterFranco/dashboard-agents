import { describe, expect, it } from 'vitest';
import { parseEnvelope } from '@agentdash/shared';
import { Pipeline, startServer } from '@agentdash/server';
import { demoScript, runDemo } from '../src/demo.js';

function runScript() {
  const p = new Pipeline(null);
  for (const step of demoScript(0)) p.ingest(parseEnvelope(step.envelope));
  const byName = Object.fromEntries(p.agents().map((a) => [a.name, a]));
  return { agents: p.agents(), byName };
}

describe('demoScript', () => {
  it('produces only valid envelopes and takes about 40 s at speed 1', () => {
    const steps = demoScript(0);
    for (const s of steps) expect(() => parseEnvelope(s.envelope)).not.toThrow();
    const total = steps.reduce((t, s) => t + s.delayMs, 0);
    expect(total).toBeGreaterThan(25_000);
    expect(total).toBeLessThan(60_000);
  });

  it('reproduces the six agents of the C mockup', () => {
    const { agents, byName } = runScript();
    expect(agents).toHaveLength(6);
    expect(Object.keys(byName).sort()).toEqual(['checkout-spec', 'deploy-check', 'lint-fix', 'refactor-auth', 'stripe-docs', 'test-runner']);
    expect(byName['test-runner'].parentId).toBe(byName['refactor-auth'].id);
    expect(byName['refactor-auth']).toMatchObject({ platform: 'claude', surface: 'cli', status: 'working' });
    expect(byName['refactor-auth'].extensions).toContain('mcp: github');
    expect(byName['lint-fix']).toMatchObject({ surface: 'vscode', status: 'done' });
    expect(byName['stripe-docs']).toMatchObject({ platform: 'kiro', surface: 'cli' });
    expect(byName['stripe-docs'].extensions).toContain('power: stripe');
    expect(byName['deploy-check'].status).toBe('error');
    expect(byName['checkout-spec']).toMatchObject({ surface: 'ide', status: 'waiting' });
  });
});

describe('runDemo', () => {
  it('sends every step to a running server', async () => {
    const server = await startServer({ port: 0, dbPath: ':memory:' });
    try {
      const sent = await runDemo(server.url, 1000);
      expect(sent).toBe(demoScript(0).length);
      const agents = await (await fetch(server.url + '/api/agents')).json();
      expect(agents).toHaveLength(6);
    } finally {
      await server.close();
    }
  });

  it('explains how to start the server when it is down', async () => {
    await expect(runDemo('http://127.0.0.1:1', 1000)).rejects.toThrow(/agentdash start/);
  });
});

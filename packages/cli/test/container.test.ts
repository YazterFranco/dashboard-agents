import { describe, expect, it } from 'vitest';
import { chooseEngine, conflictWith, planDown, planLogs, planUp } from '../src/container.js';

describe('chooseEngine', () => {
  it('uses the engine the user asked for', () => {
    expect(chooseEngine({ requested: 'podman', available: ['docker', 'podman'], running: [] })).toEqual({ engine: 'podman' });
  });
  it('fails when the requested engine is not available', () => {
    expect(chooseEngine({ requested: 'podman', available: ['docker'], running: [] })).toMatchObject({ error: expect.stringMatching(/Podman no está disponible/) });
  });
  it('rejects unknown engine names', () => {
    expect(chooseEngine({ requested: 'containerd', available: ['docker'], running: [] })).toMatchObject({ error: expect.stringMatching(/docker o podman/) });
  });
  it('picks the only available engine', () => {
    expect(chooseEngine({ available: ['podman'], running: [] })).toEqual({ engine: 'podman' });
  });
  it('prefers the engine that already runs AgentDash', () => {
    expect(chooseEngine({ available: ['docker', 'podman'], running: ['podman'] })).toEqual({ engine: 'podman' });
  });
  it('defaults to Docker when both are available and says how to switch', () => {
    expect(chooseEngine({ available: ['docker', 'podman'], running: [] })).toMatchObject({ engine: 'docker', note: expect.stringMatching(/--engine podman/) });
  });
  it('explains what to install when no engine is available', () => {
    expect(chooseEngine({ available: [], running: [] })).toMatchObject({ error: expect.stringMatching(/Docker o Podman/) });
  });
});

describe('conflictWith', () => {
  it('warns when the other engine already runs AgentDash on the same port', () => {
    expect(conflictWith('docker', ['podman'])).toMatch(/Podman/);
    expect(conflictWith('docker', ['podman'])).toMatch(/container down --engine podman/);
  });
  it('is fine when nothing else runs it', () => {
    expect(conflictWith('docker', [])).toBeUndefined();
    expect(conflictWith('docker', ['docker'])).toBeUndefined();
  });
});

describe('command plans', () => {
  it('starts Docker through compose', () => {
    expect(planUp('docker')).toEqual([['docker', 'compose', 'up', '-d', '--build']]);
  });
  it('builds Podman images in Docker format so the healthcheck survives, and replaces an old container', () => {
    expect(planUp('podman')).toEqual([
      ['podman', 'build', '--format', 'docker', '-t', 'agentdash:local', '.'],
      ['podman', 'run', '-d', '--replace', '--name', 'agentdash', '-p', '127.0.0.1:4820:4820', '-v', 'agentdash-data:/data', '--restart', 'unless-stopped', 'agentdash:local'],
    ]);
  });
  it('stops without deleting the history volume', () => {
    expect(planDown('docker')).toEqual([['docker', 'compose', 'down']]);
    expect(planDown('podman')).toEqual([['podman', 'rm', '-f', 'agentdash']]);
  });
  it('follows the logs', () => {
    expect(planLogs('docker')).toEqual([['docker', 'compose', 'logs', '-f', 'agentdash']]);
    expect(planLogs('podman')).toEqual([['podman', 'logs', '-f', 'agentdash']]);
  });
});

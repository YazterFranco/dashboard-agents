import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.js';
import { loadDotEnv } from '../src/env.js';

describe('loadDotEnv', () => {
  const dirs: string[] = [];
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });
  const envFile = (content: string): string => {
    const dir = mkdtempSync(join(tmpdir(), 'lucca-env-'));
    dirs.push(dir);
    const path = join(dir, '.env');
    writeFileSync(path, content);
    return path;
  };

  it('reads values from a .env file, ignoring comments and unquoting', () => {
    const env: NodeJS.ProcessEnv = {};
    const loaded = loadDotEnv(envFile('# comentario\nLUCCA_PORT=5000\nTZ=America/Bogota\nMEREB_URL="https://mereb.example"\n'), env);
    expect(loaded).toBe(true);
    expect(env).toEqual({ LUCCA_PORT: '5000', TZ: 'America/Bogota', MEREB_URL: 'https://mereb.example' });
  });

  it('a value from .env reaches loadConfig', () => {
    const env: NodeJS.ProcessEnv = {};
    loadDotEnv(envFile('LUCCA_PORT=5000\nTZ=America/Bogota\nLUCCA_DEMO=1\n'), env);
    expect(loadConfig(env)).toMatchObject({ port: 5000, tz: 'America/Bogota', demo: true });
  });

  it('does not override variables already set in the environment', () => {
    const env: NodeJS.ProcessEnv = { LUCCA_PORT: '4999' };
    loadDotEnv(envFile('LUCCA_PORT=5000\nLUCCA_DEMO=1\n'), env);
    expect(env.LUCCA_PORT).toBe('4999');
    expect(env.LUCCA_DEMO).toBe('1');
  });

  it('does nothing when the file does not exist', () => {
    const env: NodeJS.ProcessEnv = {};
    expect(loadDotEnv('/no/such/dir/.env', env)).toBe(false);
    expect(env).toEqual({});
  });

  it('treats the empty placeholders of .env.example as unset', () => {
    const env: NodeJS.ProcessEnv = {};
    loadDotEnv(envFile('ANTHROPIC_API_KEY=\nLUCCA_PORT=\n'), env);
    expect(loadConfig(env)).toMatchObject({ port: 4830, aiConfigured: false });
  });
});

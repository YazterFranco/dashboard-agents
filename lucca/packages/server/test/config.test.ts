import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('has safe defaults', () => {
    expect(loadConfig({})).toEqual({
      host: '0.0.0.0',
      port: 4830,
      dbPath: './data/lucca.db',
      tz: 'America/Panama',
      demo: false,
      webDir: null,
      publicUrl: null,
      aiConfigured: false,
    });
  });

  it('reads overrides', () => {
    const c = loadConfig({
      LUCCA_HOST: '127.0.0.1',
      LUCCA_PORT: '5000',
      LUCCA_DB: '/data/x.db',
      TZ: 'America/Bogota',
      LUCCA_DEMO: '1',
      LUCCA_WEB_DIR: '/app/web',
    });
    expect(c).toMatchObject({ host: '127.0.0.1', port: 5000, dbPath: '/data/x.db', tz: 'America/Bogota', demo: true, webDir: '/app/web' });
  });

  it('treats empty values as unset', () => {
    expect(loadConfig({ LUCCA_PORT: '', TZ: '', LUCCA_PUBLIC_URL: '' })).toMatchObject({ port: 4830, tz: 'America/Panama', publicUrl: null });
  });

  it('rejects an invalid port', () => {
    expect(() => loadConfig({ LUCCA_PORT: 'abc' })).toThrow(/LUCCA_PORT/);
    expect(() => loadConfig({ LUCCA_PORT: '70000' })).toThrow(/LUCCA_PORT/);
    expect(() => loadConfig({ LUCCA_PORT: '0' })).toThrow(/LUCCA_PORT/);
  });

  it('rejects an invalid timezone', () => {
    expect(() => loadConfig({ TZ: 'Mars/Olympus' })).toThrow(/TZ/);
  });

  it('never keeps the API key', () => {
    const c = loadConfig({ ANTHROPIC_API_KEY: 'sk-test-123' });
    expect(JSON.stringify(c)).not.toContain('sk-test-123');
    expect(c.aiConfigured).toBe(true);
  });

  it('strips trailing slashes from the public url', () => {
    expect(loadConfig({ LUCCA_PUBLIC_URL: 'http://192.168.1.50:4830//' }).publicUrl).toBe('http://192.168.1.50:4830');
  });
});

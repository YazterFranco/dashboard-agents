import { describe, expect, it } from 'vitest';
import { loadConfig, parseFakeNow } from '../src/config.js';

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
      merebConfigured: false,
      aiMode: 'off',
    });
  });

  it('chooses where lessons come from: real AI with a key, recorded on request, none otherwise', () => {
    expect(loadConfig({ ANTHROPIC_API_KEY: 'sk-x' }).aiMode).toBe('live');
    expect(loadConfig({ LUCCA_AI: 'recorded' }).aiMode).toBe('recorded');
    expect(loadConfig({ ANTHROPIC_API_KEY: 'sk-x', LUCCA_AI: 'recorded' }).aiMode).toBe('recorded');
    expect(loadConfig({ ANTHROPIC_API_KEY: 'sk-x', LUCCA_AI: 'off' }).aiMode).toBe('off');
    expect(loadConfig({}).aiMode).toBe('off');
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

  it('knows when Mereb is fully configured, without keeping any value', () => {
    const full = { MEREB_URL: 'https://mereb.example', MEREB_USER: 'papa', MEREB_PASSWORD: 'secreto' };
    expect(loadConfig(full).merebConfigured).toBe(true);
    expect(JSON.stringify(loadConfig(full))).not.toMatch(/secreto|papa|mereb\.example/);
  });

  it.each(['MEREB_URL', 'MEREB_USER', 'MEREB_PASSWORD'])('Mereb is not configured when %s is missing or empty', (missing) => {
    const full: Record<string, string> = { MEREB_URL: 'https://mereb.example', MEREB_USER: 'papa', MEREB_PASSWORD: 'secreto' };
    expect(loadConfig({ ...full, [missing]: '' }).merebConfigured).toBe(false);
    delete full[missing];
    expect(loadConfig(full).merebConfigured).toBe(false);
  });
});

describe('parseFakeNow', () => {
  it('is null when the variable is not set or empty', () => {
    expect(parseFakeNow(undefined)).toBeNull();
    expect(parseFakeNow('')).toBeNull();
  });

  it('reads an ISO instant', () => {
    expect(parseFakeNow('2026-11-18T17:00:00Z')!.toISOString()).toBe('2026-11-18T17:00:00.000Z');
  });

  it('says which variable is wrong when it is not a date', () => {
    expect(() => parseFakeNow('ayer')).toThrow(/LUCCA_FAKE_NOW/);
    expect(() => parseFakeNow('2026-13-45')).toThrow(/LUCCA_FAKE_NOW/);
  });
});

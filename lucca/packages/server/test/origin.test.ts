import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { LuccaDb } from '../src/db.js';

/** Publicado detrás de Cloudflare: el Worker añade una cabecera secreta; sin ella, nada entra (aunque llegue de una IP privada). */
const SECRET = 'a'.repeat(24) + 'b'.repeat(24);
const SETUP = { pin: '482913', childName: 'Lucca', grade: 2, lang: 'es', theme: 'dark' } as const;

describe('LUCCA_ORIGIN_SECRET en la configuración', () => {
  it('por defecto no hay secreto: se usa la red de casa', () => {
    expect(loadConfig({}).originSecret).toBeNull();
  });

  it('lee el secreto y exige al menos 32 caracteres', () => {
    expect(loadConfig({ LUCCA_ORIGIN_SECRET: SECRET }).originSecret).toBe(SECRET);
    expect(() => loadConfig({ LUCCA_ORIGIN_SECRET: 'corto' })).toThrow(/LUCCA_ORIGIN_SECRET.*32/);
  });

  it('usa PORT (Railway) si no hay LUCCA_PORT', () => {
    expect(loadConfig({ PORT: '8080' }).port).toBe(8080);
    expect(loadConfig({ PORT: '8080', LUCCA_PORT: '4900' }).port).toBe(4900);
  });
});

describe('servidor detrás de Cloudflare', () => {
  let app: FastifyInstance;
  let db: LuccaDb;
  afterEach(async () => {
    await app.close();
    db.close();
  });
  const start = async (originSecret: string | null) => {
    db = new LuccaDb(':memory:');
    app = await buildApp({ db, config: { ...loadConfig({}), originSecret } });
  };
  const get = (url: string, headers: Record<string, string> = {}, remoteAddress = '203.0.113.9') =>
    app.inject({ method: 'GET', url, headers, remoteAddress });

  it('con la cabecera correcta entra desde cualquier IP', async () => {
    await start(SECRET);
    const res = await get('/api/kid/state', { 'x-lucca-origin': SECRET });
    expect(res.statusCode).toBe(200);
  });

  it('sin cabecera, o con una equivocada, no entra (ni desde la red de casa)', async () => {
    await start(SECRET);
    const attempts: Record<string, string>[] = [{}, { 'x-lucca-origin': 'x' }, { 'x-lucca-origin': SECRET.slice(0, -1) + 'c' }, { 'x-lucca-origin': SECRET + 'x' }];
    for (const headers of attempts) {
      const res = await get('/api/kid/state', headers);
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: 'acceso no permitido' });
    }
    expect((await get('/api/kid/state', {}, '192.168.1.50')).statusCode).toBe(403);
    expect((await get('/papa', {})).statusCode).toBe(403);
  });

  it('la comprobación de salud responde sin secreto, pero sin detalles', async () => {
    await start(SECRET);
    const res = await get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect((await get('/api/health', { 'x-lucca-origin': SECRET })).json()).toMatchObject({ ok: true, version: expect.any(String) });
  });

  it('la cookie de papá se marca Secure (solo viaja por HTTPS)', async () => {
    await start(SECRET);
    const res = await app.inject({ method: 'POST', url: '/api/parent/setup', payload: SETUP, headers: { 'x-lucca-origin': SECRET }, remoteAddress: '203.0.113.9' });
    expect(res.statusCode).toBe(201);
    expect(String(res.headers['set-cookie'])).toMatch(/; Secure/);
  });

  it('sin secreto sigue igual que siempre: red de casa sí, internet no, cookie sin Secure', async () => {
    await start(null);
    expect((await get('/api/kid/state', {}, '192.168.1.50')).statusCode).toBe(200);
    expect((await get('/api/kid/state', { 'x-lucca-origin': SECRET }, '203.0.113.9')).statusCode).toBe(403);
    const res = await app.inject({ method: 'POST', url: '/api/parent/setup', payload: SETUP, remoteAddress: '192.168.1.50' });
    expect(String(res.headers['set-cookie'])).not.toMatch(/Secure/);
  });
});

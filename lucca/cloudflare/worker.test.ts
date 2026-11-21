import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { resetKeyCache, type Env } from './worker';

/** El Worker de Cloudflare delante de Railway: solo deja pasar a quien Cloudflare Access ya autenticó. */
const TEAM = 'familia';
const AUD = 'aud-lucca-123';
const SECRET = 's'.repeat(48);
const ORIGIN = 'https://lucca-production.up.railway.app';
const env: Env = { ORIGIN_URL: ORIGIN, ORIGIN_SECRET: SECRET, ACCESS_TEAM_DOMAIN: `${TEAM}.cloudflareaccess.com`, ACCESS_AUD: AUD };

let keys: CryptoKeyPair;
let otherKeys: CryptoKeyPair;
let jwk: JsonWebKey;

const b64url = (data: ArrayBuffer | string) =>
  Buffer.from(typeof data === 'string' ? data : new Uint8Array(data))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

async function token(claims: Record<string, unknown> = {}, opts: { key?: CryptoKey; kid?: string; alg?: string } = {}) {
  const header = b64url(JSON.stringify({ alg: opts.alg ?? 'RS256', kid: opts.kid ?? 'k1', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({ aud: [AUD], iss: `https://${TEAM}.cloudflareaccess.com`, exp: now + 600, iat: now, email: 'papa@example.com', ...claims }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', opts.key ?? keys.privateKey, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(sig)}`;
}

const fetchMock = vi.fn();
beforeAll(async () => {
  const gen = () => crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']) as Promise<CryptoKeyPair>;
  keys = await gen();
  otherKeys = await gen();
  jwk = { ...(await crypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'k1', alg: 'RS256' } as JsonWebKey;
});
beforeEach(() => {
  resetKeyCache();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input: Request | string) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url === `https://${TEAM}.cloudflareaccess.com/cdn-cgi/access/certs`) return Response.json({ keys: [jwk] });
    return new Response('desde railway', { status: 200, headers: { 'x-from': 'origin' } });
  });
  vi.stubGlobal('fetch', fetchMock);
});

const call = (headers: Record<string, string> = {}, path = '/api/kid/state', init: RequestInit = {}, e: Env = env) =>
  worker.fetch(new Request(`https://lucca.cuenta.workers.dev${path}`, { headers, ...init }), e);
const originCall = () => fetchMock.mock.calls.map(([r]) => r).find((r) => typeof r !== 'string' && r.url.startsWith(ORIGIN)) as Request | undefined;

describe('Worker: positivo', () => {
  it('con un token de Access válido reenvía a Railway con la cabecera secreta', async () => {
    const res = await call({ 'cf-access-jwt-assertion': await token() }, '/papa?x=1');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('desde railway');
    const sent = originCall()!;
    expect(sent.url).toBe(`${ORIGIN}/papa?x=1`);
    expect(sent.headers.get('x-lucca-origin')).toBe(SECRET);
  });

  it('reenvía el cuerpo (subir el PDF) y la cookie de papá', async () => {
    const body = new Uint8Array([37, 80, 68, 70]);
    await call({ 'cf-access-jwt-assertion': await token(), cookie: 'lucca_parent=abc', 'content-type': 'application/pdf' }, '/api/parent/agenda/pdf', { method: 'POST', body });
    const sent = originCall()!;
    expect(sent.method).toBe('POST');
    expect(new Uint8Array(await sent.arrayBuffer())).toEqual(body);
    expect(sent.headers.get('cookie')).toBe('lucca_parent=abc');
  });

  it('las claves de Access se piden una vez y se reutilizan', async () => {
    const t = await token();
    await call({ 'cf-access-jwt-assertion': t });
    await call({ 'cf-access-jwt-assertion': t });
    const certs = fetchMock.mock.calls.filter(([r]) => String(typeof r === 'string' ? r : r.url).includes('/cdn-cgi/access/certs'));
    expect(certs).toHaveLength(1);
  });
});

describe('Worker: negativo', () => {
  it('sin token de Access no pasa y Railway ni se entera', async () => {
    const res = await call();
    expect(res.status).toBe(403);
    expect(originCall()).toBeUndefined();
  });

  it.each([
    ['caducado', { exp: Math.floor(Date.now() / 1000) - 10 }],
    ['de otra aplicación', { aud: ['otra'] }],
    ['de otro equipo', { iss: 'https://otro.cloudflareaccess.com' }],
  ])('un token %s no pasa', async (_name, claims) => {
    const res = await call({ 'cf-access-jwt-assertion': await token(claims) });
    expect(res.status).toBe(403);
    expect(originCall()).toBeUndefined();
  });

  it('un token firmado con otra clave, o alterado, no pasa', async () => {
    expect((await call({ 'cf-access-jwt-assertion': await token({}, { key: otherKeys.privateKey }) })).status).toBe(403);
    const t = await token();
    const [h, , s] = t.split('.');
    const forged = `${h}.${b64url(JSON.stringify({ aud: [AUD], iss: `https://${TEAM}.cloudflareaccess.com`, exp: 9999999999, email: 'x@y.z' }))}.${s}`;
    expect((await call({ 'cf-access-jwt-assertion': forged })).status).toBe(403);
    expect((await call({ 'cf-access-jwt-assertion': 'basura' })).status).toBe(403);
    expect(originCall()).toBeUndefined();
  });

  it('un token con alg «none» no pasa', async () => {
    const [, p] = (await token()).split('.');
    const none = `${b64url(JSON.stringify({ alg: 'none', kid: 'k1' }))}.${p}.`;
    expect((await call({ 'cf-access-jwt-assertion': none })).status).toBe(403);
  });

  it('si falta configuración, no reenvía nada (nunca queda abierto por error)', async () => {
    for (const missing of ['ORIGIN_URL', 'ORIGIN_SECRET', 'ACCESS_TEAM_DOMAIN', 'ACCESS_AUD'] as const) {
      const res = await call({ 'cf-access-jwt-assertion': await token() }, '/', {}, { ...env, [missing]: '' });
      expect(res.status).toBe(503);
    }
    expect(originCall()).toBeUndefined();
  });
});

describe('Worker: bordes', () => {
  it('una cabecera secreta que mande el navegador se reemplaza por la buena', async () => {
    await call({ 'cf-access-jwt-assertion': await token(), 'x-lucca-origin': 'inventada' });
    expect(originCall()!.headers.get('x-lucca-origin')).toBe(SECRET);
  });

  it('si Railway no responde, avisa con un 502 amable', async () => {
    fetchMock.mockImplementation(async (input: Request | string) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/cdn-cgi/access/certs')) return Response.json({ keys: [jwk] });
      throw new TypeError('connect failed');
    });
    const res = await call({ 'cf-access-jwt-assertion': await token() });
    expect(res.status).toBe(502);
    expect(await res.text()).toMatch(/asistente no responde/);
  });

  it('si no se pueden leer las claves de Access, no deja pasar', async () => {
    fetchMock.mockImplementation(async () => new Response('caído', { status: 500 }));
    expect((await call({ 'cf-access-jwt-assertion': await token() })).status).toBe(403);
  });
});

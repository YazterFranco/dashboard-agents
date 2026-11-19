import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { KidState } from '@lucca/shared';
import { buildApp } from '../src/app.js';
import { loadConfig, type Config } from '../src/config.js';
import { LuccaDb } from '../src/db.js';

const START = Date.parse('2026-11-18T17:00:00Z');
const MIN = 60_000;
const SETUP = { pin: '482913', childName: 'Lucca', grade: 2, lang: 'es', theme: 'dark' } as const;

describe('parent access', () => {
  let app: FastifyInstance;
  let db: LuccaDb;
  let clock = START;
  const responses: string[] = [];

  async function setup(overrides: Partial<Config> = {}) {
    clock = START;
    db = new LuccaDb(':memory:');
    app = await buildApp({ db, config: { ...loadConfig({}), ...overrides }, now: () => new Date(clock) });
  }
  afterEach(async () => {
    await app?.close();
    db?.close();
  });

  const send = async (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown, cookie?: string) => {
    const res = await app.inject({ method, url, payload: payload as object | undefined, headers: cookie ? { cookie } : {} });
    responses.push(res.body, JSON.stringify(res.headers));
    return res;
  };
  const cookieOf = (res: { headers: Record<string, unknown> }): string => {
    const raw = res.headers['set-cookie'];
    const header = Array.isArray(raw) ? raw[0] : String(raw);
    return header.split(';')[0];
  };
  const status = async (cookie?: string) => (await send('GET', '/api/parent/status', undefined, cookie)).json();
  const doSetup = async (body: object = SETUP) => send('POST', '/api/parent/setup', body);
  const login = (pin: string, cookie?: string) => send('POST', '/api/parent/login', { pin }, cookie);
  /** Una ruta protegida que no cambia nada: con sesión da 400 (cuerpo inválido), sin sesión 401. */
  const hasSession = async (cookie?: string) => (await send('PUT', '/api/parent/pin', { currentPin: 'x', newPin: '12' }, cookie)).statusCode === 400;
  const wrongPins = async (n: number) => {
    let last;
    for (let i = 0; i < n; i++) last = await login('000000');
    return last!;
  };

  describe('positive', () => {
    it('starts without a configuration', async () => {
      await setup();
      expect(await status()).toEqual({ setupDone: false, authenticated: false, locked: false, retryAfterSeconds: 0, connections: { ai: false, mereb: false } });
    });

    it('the setup creates the PIN and opens a session with a protected cookie', async () => {
      await setup();
      const res = await doSetup();
      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({ ok: true });
      const header = String(res.headers['set-cookie']);
      expect(header).toContain('HttpOnly');
      expect(header).toContain('SameSite=Strict');
      expect(await hasSession(cookieOf(res))).toBe(true);
    });

    it('after the setup the status says so, and the session is recognised', async () => {
      await setup();
      const cookie = cookieOf(await doSetup());
      expect(await status()).toMatchObject({ setupDone: true, authenticated: false });
      expect(await status(cookie)).toMatchObject({ setupDone: true, authenticated: true });
    });

    it("the setup saves the child's data where Lucca's screen reads it", async () => {
      await setup();
      await doSetup({ ...SETUP, childName: 'Lucía', grade: 3, lang: 'en', theme: 'light' });
      const kid = (await send('GET', '/api/kid/state')).json() as KidState;
      expect(kid.settings).toMatchObject({ childName: 'Lucía', grade: 3, lang: 'en', theme: 'light' });
    });

    it('logs in with the right PIN', async () => {
      await setup();
      await doSetup();
      const res = await login(SETUP.pin);
      expect(res.statusCode).toBe(200);
      expect(await hasSession(cookieOf(res))).toBe(true);
    });

    it('logout closes the session', async () => {
      await setup();
      const cookie = cookieOf(await doSetup());
      const out = await send('POST', '/api/parent/logout', undefined, cookie);
      expect(out.statusCode).toBe(204);
      expect(String(out.headers['set-cookie'])).toContain('Max-Age=0');
      expect(await hasSession(cookie)).toBe(false);
    });

    it('changing the PIN: the new one works, the old one and old sessions do not', async () => {
      await setup();
      const oldCookie = cookieOf(await doSetup());
      const other = cookieOf(await login(SETUP.pin));
      const res = await send('PUT', '/api/parent/pin', { currentPin: SETUP.pin, newPin: '7391' }, oldCookie);
      expect(res.statusCode).toBe(200);
      const fresh = cookieOf(res);
      expect(await hasSession(fresh)).toBe(true);
      expect(await hasSession(oldCookie)).toBe(false);
      expect(await hasSession(other)).toBe(false);
      expect((await login(SETUP.pin)).statusCode).toBe(401);
      expect((await login('7391')).statusCode).toBe(200);
    });

    it('the connections reflect the configuration without exposing any value', async () => {
      await setup({ aiConfigured: true, merebConfigured: true });
      const s = await status();
      expect(s.connections).toEqual({ ai: true, mereb: true });
      expect(JSON.stringify(s)).not.toMatch(/key|password|http/i);
    });
  });

  describe('negative', () => {
    it.each([
      ['a PIN of 3 digits', { pin: '123' }, 'pin'],
      ['a PIN with letters', { pin: '12a4' }, 'pin'],
      ['a PIN of 7 digits', { pin: '1234567' }, 'pin'],
      ['no PIN', { pin: undefined }, 'pin'],
      ['an empty name', { childName: '' }, 'childName'],
      ['a name of spaces', { childName: '   ' }, 'childName'],
      ['a name of 31 characters', { childName: 'a'.repeat(31) }, 'childName'],
      ['grade 9', { grade: 9 }, 'grade'],
      ['grade 0', { grade: 0 }, 'grade'],
      ['a text grade', { grade: 'dos' }, 'grade'],
      ['an unknown language', { lang: 'fr' }, 'lang'],
      ['an unknown theme', { theme: 'neón' }, 'theme'],
    ])('the setup rejects %s, names the field and saves nothing', async (_name, change, field) => {
      await setup();
      const res = await doSetup({ ...SETUP, ...change });
      expect(res.statusCode).toBe(400);
      expect(res.json().fields).toHaveProperty(field);
      expect(await status()).toMatchObject({ setupDone: false });
      expect(db.getPinRecord()).toBeNull();
    });

    it('the setup rejects an empty body and a body that is not JSON', async () => {
      await setup();
      expect((await send('POST', '/api/parent/setup', {})).statusCode).toBe(400);
      const raw = await app.inject({ method: 'POST', url: '/api/parent/setup', payload: 'no es json', headers: { 'content-type': 'application/json' } });
      expect(raw.statusCode).toBe(400);
      expect(await status()).toMatchObject({ setupDone: false });
    });

    it('the setup can only be done once and the original PIN stays', async () => {
      await setup();
      await doSetup();
      const again = await doSetup({ ...SETUP, pin: '1111' });
      expect(again.statusCode).toBe(409);
      expect((await login('1111')).statusCode).toBe(401);
      expect((await login(SETUP.pin)).statusCode).toBe(200);
    });

    it('login before the setup is a conflict', async () => {
      await setup();
      expect((await login('1234')).statusCode).toBe(409);
    });

    it('a wrong PIN says how many attempts are left', async () => {
      await setup();
      await doSetup();
      const left: number[] = [];
      for (let i = 0; i < 3; i++) {
        const res = await login('000000');
        expect(res.statusCode).toBe(401);
        left.push(res.json().attemptsLeft);
      }
      expect(left).toEqual([4, 3, 2]);
    });

    it('a PIN with the wrong format is a 400 that does not spend an attempt', async () => {
      await setup();
      await doSetup();
      for (const bad of ['12', 'abcd', '', '1234567']) {
        const res = await login(bad);
        expect(res.statusCode).toBe(400);
        expect(res.json().fields).toHaveProperty('pin');
      }
      expect((await login('000000')).json().attemptsLeft).toBe(4);
    });

    it('login rejects a missing PIN and a PIN that is not text', async () => {
      await setup();
      await doSetup();
      expect((await send('POST', '/api/parent/login', {})).statusCode).toBe(400);
      expect((await send('POST', '/api/parent/login', { pin: 482913 })).statusCode).toBe(400);
    });

    it('changing the PIN needs a session', async () => {
      await setup();
      await doSetup();
      const res = await send('PUT', '/api/parent/pin', { currentPin: SETUP.pin, newPin: '7391' });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: 'Hace falta el PIN' });
      expect((await login(SETUP.pin)).statusCode).toBe(200);
    });

    it('a wrong current PIN is a 401 that counts as an attempt and changes nothing', async () => {
      await setup();
      const cookie = cookieOf(await doSetup());
      const res = await send('PUT', '/api/parent/pin', { currentPin: '000000', newPin: '7391' }, cookie);
      expect(res.statusCode).toBe(401);
      expect(res.json().attemptsLeft).toBe(4);
      expect((await login('000000')).json().attemptsLeft).toBe(3);
      expect((await login(SETUP.pin)).statusCode).toBe(200);
      expect((await login('7391')).statusCode).toBe(401);
    });

    it('an invalid new PIN is a 400 before anything is counted or changed', async () => {
      await setup();
      const cookie = cookieOf(await doSetup());
      for (const newPin of ['12', 'abcd', '1234567']) {
        const res = await send('PUT', '/api/parent/pin', { currentPin: SETUP.pin, newPin }, cookie);
        expect(res.statusCode).toBe(400);
        expect(res.json().fields).toHaveProperty('newPin');
      }
      expect((await login(SETUP.pin)).statusCode).toBe(200);
      expect((await login('000000')).json().attemptsLeft).toBe(4);
    });

    it('rejects an invented cookie, an empty one and one from another application', async () => {
      await setup();
      await doSetup();
      for (const cookie of ['lucca_parent=' + 'a'.repeat(64), 'lucca_parent=', 'sesion=abc', 'lucca_parent=%00']) {
        expect(await hasSession(cookie)).toBe(false);
      }
    });

    it('never puts the PIN or its record in any response', async () => {
      await setup();
      const cookie = cookieOf(await doSetup());
      await status(cookie);
      await login(SETUP.pin);
      await login('000000');
      await send('PUT', '/api/parent/pin', { currentPin: SETUP.pin, newPin: '7391' }, cookie);
      const everything = responses.join('\n');
      expect(everything).not.toContain('scrypt$');
      expect(everything).not.toContain(SETUP.pin);
    });
  });

  describe('edge', () => {
    it('five failures lock for 5 minutes and say so', async () => {
      await setup();
      await doSetup();
      const res = await wrongPins(5);
      expect(res.statusCode).toBe(423);
      expect(res.json()).toEqual({ error: 'Demasiados intentos', retryAfterSeconds: 300 });
      expect(res.headers['retry-after']).toBe('300');
    });

    it('the right PIN during the lock does not enter and does not extend the lock', async () => {
      await setup();
      await doSetup();
      await wrongPins(5);
      clock += 120_000;
      const during = await login(SETUP.pin);
      expect(during.statusCode).toBe(423);
      expect(during.json().retryAfterSeconds).toBe(180);
      expect(during.headers['set-cookie']).toBeUndefined();
      clock = START + 300_000;
      expect((await login(SETUP.pin)).statusCode).toBe(200);
    });

    it('stays locked at 299 seconds and opens at 300', async () => {
      await setup();
      await doSetup();
      await wrongPins(5);
      clock = START + 299_000;
      const late = await login(SETUP.pin);
      expect(late.statusCode).toBe(423);
      expect(late.json().retryAfterSeconds).toBe(1);
      clock = START + 300_000;
      expect((await login(SETUP.pin)).statusCode).toBe(200);
    });

    it('wrong attempts after the lock start counting from zero', async () => {
      await setup();
      await doSetup();
      await wrongPins(5);
      clock = START + 300_000;
      expect((await login('000000')).json().attemptsLeft).toBe(4);
    });

    it('four failures, a success and four more failures do not lock', async () => {
      await setup();
      await doSetup();
      await wrongPins(4);
      expect((await login(SETUP.pin)).statusCode).toBe(200);
      expect((await wrongPins(4)).statusCode).toBe(401);
    });

    it('the status shows the lock and the time left', async () => {
      await setup();
      await doSetup();
      await wrongPins(5);
      clock += 30_000;
      expect(await status()).toMatchObject({ locked: true, retryAfterSeconds: 270 });
    });

    it('while locked, changing the PIN is also refused and Lucca can keep using the app', async () => {
      await setup();
      const cookie = cookieOf(await doSetup());
      await wrongPins(5);
      const res = await send('PUT', '/api/parent/pin', { currentPin: SETUP.pin, newPin: '7391' }, cookie);
      expect(res.statusCode).toBe(423);
      expect((await send('GET', '/api/kid/state')).statusCode).toBe(200);
      expect((await send('GET', '/api/health')).statusCode).toBe(200);
    });

    it('the session is valid just before 15 minutes and renews with each use', async () => {
      await setup();
      const cookie = cookieOf(await doSetup());
      clock += 14 * MIN + 59_000;
      expect(await hasSession(cookie)).toBe(true);
      clock += 14 * MIN + 59_000;
      expect(await hasSession(cookie)).toBe(true);
    });

    it('the session expires after 15 minutes without activity and the cookie is cleared', async () => {
      await setup();
      const cookie = cookieOf(await doSetup());
      clock += 15 * MIN + 1_000;
      const res = await send('PUT', '/api/parent/pin', { currentPin: 'x', newPin: '12' }, cookie);
      expect(res.statusCode).toBe(401);
      expect(String(res.headers['set-cookie'])).toContain('Max-Age=0');
      clock += 1_000;
      expect(await hasSession(cookie)).toBe(false);
    });

    it('the status stops saying "authenticated" once the session expired', async () => {
      await setup();
      const cookie = cookieOf(await doSetup());
      clock += 16 * MIN;
      expect((await status(cookie)).authenticated).toBe(false);
    });

    it('two sessions are independent', async () => {
      await setup();
      const a = cookieOf(await doSetup());
      const b = cookieOf(await login(SETUP.pin));
      expect(a).not.toBe(b);
      await send('POST', '/api/parent/logout', undefined, a);
      expect(await hasSession(a)).toBe(false);
      expect(await hasSession(b)).toBe(true);
    });

    it('logout without a session is harmless', async () => {
      await setup();
      expect((await send('POST', '/api/parent/logout')).statusCode).toBe(204);
      expect((await send('POST', '/api/parent/logout', undefined, 'lucca_parent=nope')).statusCode).toBe(204);
    });

    it('expired sessions are purged when someone logs in', async () => {
      await setup();
      await doSetup();
      clock += 20 * MIN;
      await login(SETUP.pin);
      // Solo queda la sesión nueva: la del arranque, inactiva desde hace 20 minutos, se purgó al entrar.
      expect(db.deleteSessionsIdleSince('9999-12-31T00:00:00.000Z')).toBe(1);
    });
  });
});

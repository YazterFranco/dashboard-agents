import { describe, expect, it } from 'vitest';
import {
  COOKIE_NAME,
  LoginThrottle,
  SESSION_IDLE_MS,
  clearedCookie,
  hashPin,
  newToken,
  readCookie,
  sessionCookie,
  tokenId,
  verifyPin,
} from '../src/auth.js';

describe('hashPin / verifyPin', () => {
  it('verifies the right PIN', () => {
    expect(verifyPin('1234', hashPin('1234'))).toBe(true);
    expect(verifyPin('000000', hashPin('000000'))).toBe(true);
  });

  it('rejects a wrong PIN', () => {
    expect(verifyPin('0000', hashPin('1234'))).toBe(false);
    expect(verifyPin('12345', hashPin('1234'))).toBe(false);
    expect(verifyPin('', hashPin('1234'))).toBe(false);
  });

  it('uses a random salt: the same PIN gives different records', () => {
    expect(hashPin('1234')).not.toBe(hashPin('1234'));
  });

  it('never contains the PIN in the record', () => {
    const record = hashPin('987654');
    expect(record.startsWith('scrypt$')).toBe(true);
    expect(record.split('$')[1]).not.toContain('987654');
    expect(record.split('$')[2]).not.toContain('987654');
  });

  it.each(['', 'x', 'scrypt$', 'scrypt$aa$bb', 'md5$aa$bb', 'scrypt$zz$yy', 'scrypt$00112233445566778899aabbccddeeff$short'])(
    'returns false, without throwing, for the malformed record %j',
    (record) => {
      expect(verifyPin('1234', record)).toBe(false);
    },
  );
});

describe('LoginThrottle', () => {
  const T0 = 1_000_000;

  it('starts with 5 attempts and no lock', () => {
    expect(new LoginThrottle().status(T0)).toEqual({ locked: false, retryAfterSeconds: 0, attemptsLeft: 5 });
  });

  it('counts down the attempts and locks on the fifth failure', () => {
    const t = new LoginThrottle();
    expect(t.fail(T0).attemptsLeft).toBe(4);
    expect(t.fail(T0).attemptsLeft).toBe(3);
    expect(t.fail(T0).attemptsLeft).toBe(2);
    expect(t.fail(T0)).toEqual({ locked: false, retryAfterSeconds: 0, attemptsLeft: 1 });
    expect(t.fail(T0)).toEqual({ locked: true, retryAfterSeconds: 300, attemptsLeft: 0 });
  });

  it('stays locked for exactly 5 minutes', () => {
    const t = new LoginThrottle();
    for (let i = 0; i < 5; i++) t.fail(T0);
    expect(t.status(T0 + 299_000)).toEqual({ locked: true, retryAfterSeconds: 1, attemptsLeft: 0 });
    expect(t.status(T0 + 299_001).locked).toBe(true);
    expect(t.status(T0 + 300_000)).toEqual({ locked: false, retryAfterSeconds: 0, attemptsLeft: 5 });
  });

  it('rounds the remaining time up to whole seconds', () => {
    const t = new LoginThrottle();
    for (let i = 0; i < 5; i++) t.fail(T0);
    expect(t.status(T0 + 100_500).retryAfterSeconds).toBe(200);
  });

  it('a failure during the lock neither counts nor extends it', () => {
    const t = new LoginThrottle();
    for (let i = 0; i < 5; i++) t.fail(T0);
    const during = t.fail(T0 + 60_000);
    expect(during).toEqual({ locked: true, retryAfterSeconds: 240, attemptsLeft: 0 });
    expect(t.status(T0 + 300_000).locked).toBe(false);
  });

  it('a success resets the count', () => {
    const t = new LoginThrottle();
    for (let i = 0; i < 4; i++) t.fail(T0);
    t.succeed();
    expect(t.status(T0).attemptsLeft).toBe(5);
    for (let i = 0; i < 4; i++) t.fail(T0);
    expect(t.status(T0).locked).toBe(false);
  });

  it('starts counting from zero after the lock expires', () => {
    const t = new LoginThrottle();
    for (let i = 0; i < 5; i++) t.fail(T0);
    expect(t.fail(T0 + 300_000).attemptsLeft).toBe(4);
  });

  it('accepts custom limits', () => {
    const t = new LoginThrottle(2, 10_000);
    t.fail(T0);
    expect(t.fail(T0)).toEqual({ locked: true, retryAfterSeconds: 10, attemptsLeft: 0 });
  });
});

describe('cookies and tokens', () => {
  it('reads a cookie among several', () => {
    expect(readCookie('a=1; lucca_parent=abc123; b=2', COOKIE_NAME)).toBe('abc123');
    expect(readCookie('lucca_parent=abc123', COOKIE_NAME)).toBe('abc123');
  });

  it('returns null when the cookie is missing, empty or the header is absent', () => {
    expect(readCookie(undefined, COOKIE_NAME)).toBeNull();
    expect(readCookie('', COOKIE_NAME)).toBeNull();
    expect(readCookie('a=1; b=2', COOKIE_NAME)).toBeNull();
    expect(readCookie('lucca_parent=', COOKIE_NAME)).toBeNull();
  });

  it('does not confuse a cookie with a similar name', () => {
    expect(readCookie('x_lucca_parent=evil; lucca_parent_2=evil', COOKIE_NAME)).toBeNull();
  });

  it('tolerates spaces and values containing "="', () => {
    expect(readCookie('  a=1 ;   lucca_parent=ab=cd  ; b=2', COOKIE_NAME)).toBe('ab=cd');
  });

  it('builds a session cookie that scripts cannot read and other sites cannot send', () => {
    const c = sessionCookie('tok');
    expect(c).toContain('lucca_parent=tok');
    expect(c).toContain('HttpOnly');
    expect(c).toContain('SameSite=Strict');
    expect(c).toContain('Path=/');
    expect(c).not.toContain('Secure');
  });

  it('clears the cookie', () => {
    expect(clearedCookie()).toContain('Max-Age=0');
    expect(clearedCookie()).toContain('lucca_parent=;');
  });

  it('creates different 64-hex tokens', () => {
    const a = newToken();
    const b = newToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it('derives a deterministic id that does not reveal the token', () => {
    const token = newToken();
    expect(tokenId(token)).toBe(tokenId(token));
    expect(tokenId(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenId(token)).not.toContain(token);
    expect(tokenId(token)).not.toBe(tokenId(newToken()));
  });

  it('keeps sessions for 15 minutes of inactivity', () => {
    expect(SESSION_IDLE_MS).toBe(15 * 60 * 1000);
  });
});

import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const COOKIE_NAME = 'lucca_parent';
/** Una sesión del padre se cierra sola tras 15 minutos sin actividad. */
export const SESSION_IDLE_MS = 15 * 60 * 1000;

const SALT_BYTES = 16;
const HASH_BYTES = 32;

/** Guarda un PIN como `scrypt$<sal>$<hash>`. La sal es aleatoria: el mismo PIN da registros distintos. */
export function hashPin(pin: string): string {
  const salt = randomBytes(SALT_BYTES);
  const hash = scryptSync(pin, salt, HASH_BYTES);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/** Comprueba un PIN contra su registro en tiempo constante. Un registro mal formado da `false`, nunca una excepción. */
export function verifyPin(pin: string, record: string): boolean {
  const parts = record.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, saltHex, hashHex] = parts;
  if (!/^[0-9a-f]{32}$/.test(saltHex) || !/^[0-9a-f]{64}$/.test(hashHex)) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(pin, Buffer.from(saltHex, 'hex'), HASH_BYTES);
  return timingSafeEqual(actual, expected);
}

export interface ThrottleStatus {
  locked: boolean;
  retryAfterSeconds: number;
  attemptsLeft: number;
}

/**
 * Bloqueo por intentos fallidos: 5 fallos seguidos bloquean 5 minutos. Es global (hay un solo PIN y la tablet
 * de Lucca comparte la red). Un fallo durante el bloqueo no cuenta ni lo alarga; al vencer, la cuenta vuelve a cero.
 */
export class LoginThrottle {
  private fails = 0;
  private lockedUntil = 0;

  constructor(
    private readonly maxFails = 5,
    private readonly lockMs = 300_000,
  ) {}

  status(nowMs: number): ThrottleStatus {
    if (this.lockedUntil > nowMs) {
      return { locked: true, retryAfterSeconds: Math.ceil((this.lockedUntil - nowMs) / 1000), attemptsLeft: 0 };
    }
    if (this.lockedUntil !== 0) {
      this.fails = 0;
      this.lockedUntil = 0;
    }
    return { locked: false, retryAfterSeconds: 0, attemptsLeft: this.maxFails - this.fails };
  }

  fail(nowMs: number): ThrottleStatus {
    const current = this.status(nowMs);
    if (current.locked) return current;
    this.fails++;
    if (this.fails >= this.maxFails) this.lockedUntil = nowMs + this.lockMs;
    return this.status(nowMs);
  }

  succeed(): void {
    this.fails = 0;
    this.lockedUntil = 0;
  }
}

/** Valor de la cookie de sesión: 32 bytes aleatorios. El servidor solo guarda su sha256. */
export function newToken(): string {
  return randomBytes(32).toString('hex');
}

export function tokenId(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Lee una cookie de la cabecera `Cookie`; `null` si no está o viene vacía. No confunde nombres parecidos. */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const item = part.trim();
    const eq = item.indexOf('=');
    if (eq === -1 || item.slice(0, eq) !== name) continue;
    const value = item.slice(eq + 1).trim();
    return value === '' ? null : value;
  }
  return null;
}

/** HttpOnly: los scripts no la leen. SameSite=Strict: otras webs no la envían. Sin Secure: la red de casa va por HTTP. */
/** `secure`: publicado en internet (siempre por HTTPS), la cookie solo viaja cifrada. En casa es http y no puede llevarla. */
export function sessionCookie(token: string, secure = false): string {
  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/${secure ? '; Secure' : ''}`;
}

export function clearedCookie(secure = false): string {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure ? '; Secure' : ''}`;
}

/**
 * `node:crypto` para la app de Android (WebView): solo lo que usa el código del servidor, con los mismos resultados
 * (un PIN guardado con scrypt en la computadora se comprueba igual aquí). Usa @noble/hashes, sin código nativo.
 */
import { Buffer } from 'buffer';
import { scrypt } from '@noble/hashes/scrypt.js';
import { sha256 } from '@noble/hashes/sha2.js';

type Data = string | Uint8Array;
const bytes = (d: Data): Uint8Array => (typeof d === 'string' ? new TextEncoder().encode(d) : d);

export function randomBytes(n: number): Buffer {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return Buffer.from(out);
}

export function randomUUID(): string {
  return crypto.randomUUID();
}

/** Los mismos parámetros por defecto que `scryptSync` de Node (N=16384, r=8, p=1). */
export function scryptSync(password: Data, salt: Data, keylen: number): Buffer {
  return Buffer.from(scrypt(bytes(password), bytes(salt), { N: 16384, r: 8, p: 1, dkLen: keylen }));
}

export function createHash(algorithm: string) {
  if (algorithm.toLowerCase() !== 'sha256') throw new Error(`hash no soportado en la app: ${algorithm}`);
  const chunks: Uint8Array[] = [];
  const api = {
    update(data: Data) {
      chunks.push(bytes(data));
      return api;
    },
    digest(encoding?: 'hex'): Buffer | string {
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const all = new Uint8Array(total);
      let at = 0;
      for (const c of chunks) {
        all.set(c, at);
        at += c.length;
      }
      const out = Buffer.from(sha256(all));
      return encoding === 'hex' ? out.toString('hex') : out;
    },
  };
  return api;
}

/** Comparación sin salir antes: el tiempo no depende de dónde difieren. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) throw new RangeError('Input buffers must have the same byte length');
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

import * as node from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as shim from './nodeCrypto';

describe('node:crypto de la app (mismos resultados que Node)', () => {
  it('scrypt da el mismo hash que Node con los mismos datos', () => {
    const salt = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
    expect(shim.scryptSync('482913', salt, 32).toString('hex')).toBe(node.scryptSync('482913', salt, 32).toString('hex'));
  });

  it('sha256 en hex y en bytes, por partes o de una vez', () => {
    expect(shim.createHash('sha256').update('hola').digest('hex')).toBe(node.createHash('sha256').update('hola').digest('hex'));
    const parts = shim.createHash('sha256').update('ho').update(new TextEncoder().encode('la')).digest() as Buffer;
    expect(parts.equals(node.createHash('sha256').update('hola').digest())).toBe(true);
  });

  it('un PIN guardado en la computadora se comprueba en la app', async () => {
    const auth = await import('../../../../server/src/auth');
    const record = auth.hashPin('482913');
    const [, saltHex, hashHex] = record.split('$');
    expect(shim.scryptSync('482913', Buffer.from(saltHex, 'hex'), 32).toString('hex')).toBe(hashHex);
    expect(shim.scryptSync('000000', Buffer.from(saltHex, 'hex'), 32).toString('hex')).not.toBe(hashHex);
  });

  it('bytes al azar del tamaño pedido y distintos cada vez', () => {
    const a = shim.randomBytes(32);
    expect(a).toHaveLength(32);
    expect(a.equals(shim.randomBytes(32))).toBe(false);
    expect(shim.randomUUID()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('timingSafeEqual compara y exige el mismo tamaño', () => {
    expect(shim.timingSafeEqual(Buffer.from('abc'), Buffer.from('abc'))).toBe(true);
    expect(shim.timingSafeEqual(Buffer.from('abc'), Buffer.from('abd'))).toBe(false);
    expect(() => shim.timingSafeEqual(Buffer.from('ab'), Buffer.from('abc'))).toThrow();
  });

  it('un hash que no sea sha256 falla claro', () => {
    expect(() => shim.createHash('md5')).toThrow(/no soportado/);
  });
});

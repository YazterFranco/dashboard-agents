import { describe, expect, it } from 'vitest';
import { stashShared, takeShared } from './sharedPdf';
import { memoryStore } from './storage';

const b64 = (s: string) => Buffer.from(s).toString('base64');

describe('PDF compartido con Lucca', () => {
  it('se guarda y se toma una sola vez, con su nombre', async () => {
    const store = memoryStore();
    expect(await stashShared({ name: 'export-actividades.pdf', base64: b64('%PDF-1.7 hola') }, store)).toBe(true);
    const first = await takeShared(store);
    expect(first && 'file' in first ? [first.file.name, first.file.type, await first.file.text()] : null).toEqual(['export-actividades.pdf', 'application/pdf', '%PDF-1.7 hola']);
    expect(await takeShared(store)).toBeNull();
  });

  it('sin nada pendiente no hace nada', async () => {
    const store = memoryStore();
    expect(await stashShared({}, store)).toBe(false);
    expect(await takeShared(store)).toBeNull();
  });

  it('un PDF demasiado grande o ilegible se explica, sin tecnicismos', async () => {
    const store = memoryStore();
    await stashShared({ error: 'too-large' }, store);
    expect(await takeShared(store)).toEqual({ error: 'El PDF pesa más de 5 MB' });
    await stashShared({ error: 'unreadable' }, store);
    expect(await takeShared(store)).toEqual({ error: expect.stringMatching(/No pude abrir el PDF/) });
    expect(await takeShared(store)).toBeNull();
  });

  it('sin nombre usa «agenda.pdf»', async () => {
    const store = memoryStore();
    await stashShared({ base64: b64('%PDF') }, store);
    const got = await takeShared(store);
    expect(got && 'file' in got ? got.file.name : null).toBe('agenda.pdf');
  });
});

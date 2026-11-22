import { describe, expect, it, vi } from 'vitest';
import { createNativeSpeaker, type NativeTts } from './speaker';

function fakeTts() {
  let range: ((info: { start: number; end: number; spokenWord: string }) => void) | null = null;
  const pending: Array<() => void> = [];
  const tts = {
    speak: vi.fn((_o: { text: string; lang?: string; rate?: number }) => new Promise<void>((resolve) => pending.push(resolve))),
    stop: vi.fn(async () => {}),
    addListener: vi.fn(async (_e: string, fn: typeof range) => {
      range = fn;
      return { remove: async () => {} };
    }),
  };
  const finishOne = async () => {
    pending.shift()?.();
    await new Promise((r) => setTimeout(r, 0));
  };
  return { tts: tts as unknown as NativeTts & typeof tts, finishOne, word: (start: number, end: number) => range?.({ start, end, spokenWord: '' }) };
}

describe('voz nativa de Android', () => {
  it('lee cada fragmento en su idioma, uno tras otro, y avisa al terminar', async () => {
    const { tts, finishOne } = fakeTts();
    const speaker = createNativeSpeaker(tts, 0.9, ['es-US', 'en-US']);
    const onSegmentEnd = vi.fn();
    const onEnd = vi.fn();
    speaker.speak([{ text: 'Hola', lang: 'es' }, { text: 'Hello', lang: 'en' }], { onSegmentEnd, onEnd });
    await new Promise((r) => setTimeout(r, 0));
    expect(tts.speak).toHaveBeenCalledTimes(1);
    expect(tts.speak).toHaveBeenLastCalledWith({ text: 'Hola', lang: 'es-US', rate: 0.9 });
    expect(speaker.speaking).toBe(true);
    await finishOne();
    expect(onSegmentEnd).toHaveBeenCalledWith(0);
    expect(tts.speak).toHaveBeenLastCalledWith({ text: 'Hello', lang: 'en-US', rate: 0.9 });
    await finishOne();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(speaker.speaking).toBe(false);
  });

  it('avisa cada palabra para resaltarla', async () => {
    const { tts, word } = fakeTts();
    const speaker = createNativeSpeaker(tts, 1, ['es-MX']);
    const onWord = vi.fn();
    speaker.speak([{ text: 'Hola Lucca', lang: 'es' }], { onWord });
    await new Promise((r) => setTimeout(r, 0));
    word(5, 10);
    expect(onWord).toHaveBeenCalledWith(0, 5, 5);
  });

  it('parar corta la lectura y no llegan avisos tardíos', async () => {
    const { tts, finishOne } = fakeTts();
    const speaker = createNativeSpeaker(tts);
    const onEnd = vi.fn();
    speaker.speak([{ text: 'Uno', lang: 'es' }, { text: 'Dos', lang: 'es' }], { onEnd });
    await new Promise((r) => setTimeout(r, 0));
    speaker.stop();
    await finishOne();
    expect(tts.stop).toHaveBeenCalled();
    expect(tts.speak).toHaveBeenCalledTimes(1);
    expect(onEnd).not.toHaveBeenCalled();
    expect(speaker.speaking).toBe(false);
  });

  it('sin voz de un idioma en el teléfono, ese fragmento se salta', async () => {
    const { tts } = fakeTts();
    const speaker = createNativeSpeaker(tts, 0.9, ['es-ES']);
    expect(speaker.available('en')).toBe(false);
    const onEnd = vi.fn();
    speaker.speak([{ text: 'Hello', lang: 'en' }], { onEnd });
    expect(onEnd).toHaveBeenCalled();
    expect(tts.speak).not.toHaveBeenCalled();
  });

  it('si no se sabe qué voces hay, lo intenta con la etiqueta por defecto', async () => {
    const { tts } = fakeTts();
    const speaker = createNativeSpeaker(tts);
    expect(speaker.available('en')).toBe(true);
    speaker.speak([{ text: 'Hi', lang: 'en' }]);
    await new Promise((r) => setTimeout(r, 0));
    expect(tts.speak).toHaveBeenCalledWith({ text: 'Hi', lang: 'en-US', rate: 0.9 });
  });

  it('un error del motor de voz no deja la app «hablando»', async () => {
    const { tts } = fakeTts();
    tts.speak.mockImplementationOnce(() => Promise.reject(new Error('sin motor')));
    const speaker = createNativeSpeaker(tts);
    speaker.speak([{ text: 'Hola', lang: 'es' }]);
    await new Promise((r) => setTimeout(r, 0));
    expect(speaker.speaking).toBe(false);
  });
});

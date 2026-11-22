import type { NativeTts } from './speaker';

/** Voz nativa de Android, si la app la preparó al arrancar (en la web queda vacía y se usa la del navegador). */
let voice: { tts: NativeTts; languages: string[] } | null = null;

export function setNativeVoice(tts: NativeTts, languages: string[]): void {
  voice = { tts, languages };
}

export function nativeVoice(): { tts: NativeTts; languages: string[] } | null {
  return voice;
}

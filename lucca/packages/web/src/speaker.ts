import type { Lang, VoiceMode } from '@lucca/shared';

export interface Segment {
  text: string;
  lang: Lang;
}

interface VoiceLike {
  lang: string;
  name: string;
}

/** Orden de preferencia: primero la variante más cercana a Panamá, luego cualquiera del idioma. */
const PREFERRED: Record<Lang, string[]> = {
  es: ['es-pa', 'es-mx', 'es-us', 'es-419'],
  en: ['en-us'],
};

const normalize = (tag: string): string => tag.replace('_', '-').toLowerCase();

export function pickVoice<T extends VoiceLike>(voices: readonly T[], lang: Lang): T | null {
  for (const tag of PREFERRED[lang]) {
    const exact = voices.find((v) => normalize(v.lang) === tag);
    if (exact) return exact;
  }
  return voices.find((v) => normalize(v.lang).startsWith(`${lang}-`) || normalize(v.lang) === lang) ?? null;
}

export interface SpeakHandlers {
  onWord?: (segmentIndex: number, charStart: number, charLength: number) => void;
  onSegmentEnd?: (segmentIndex: number) => void;
  onEnd?: () => void;
}

export interface Speaker {
  available(lang: Lang): boolean;
  speak(segments: Segment[], handlers?: SpeakHandlers): void;
  stop(): void;
  readonly speaking: boolean;
}

const FALLBACK_TAG: Record<Lang, string> = { es: 'es-MX', en: 'en-US' };

/**
 * Lectura con las voces del dispositivo (Web Speech API): funciona por HTTP en la red de la casa,
 * no cuesta nada y no saca datos de casa. Un fragmento = una voz de su idioma.
 */
export function createSpeaker(synth: SpeechSynthesis | undefined, rate = 0.9): Speaker {
  let speaking = false;
  /** Cada lectura nueva invalida los eventos tardíos de la anterior. */
  let generation = 0;

  const stop = (): void => {
    generation++;
    speaking = false;
    synth?.cancel();
  };

  return {
    available(lang) {
      const voices = synth?.getVoices() ?? [];
      return pickVoice(voices, lang) !== null;
    },

    get speaking() {
      return speaking;
    },

    stop,

    speak(segments, handlers = {}) {
      stop();
      if (!synth) {
        handlers.onEnd?.();
        return;
      }
      const voices = synth.getVoices();
      // Aún sin lista de voces (el navegador la carga tarde): se habla con la etiqueta del idioma.
      const playable = segments
        .map((segment, index) => ({ segment, index, voice: voices.length ? pickVoice(voices, segment.lang) : null }))
        .filter((p) => voices.length === 0 || p.voice !== null);

      if (playable.length === 0) {
        handlers.onEnd?.();
        return;
      }

      const mine = generation;
      speaking = true;
      playable.forEach(({ segment, index, voice }, position) => {
        const utterance = new SpeechSynthesisUtterance(segment.text);
        utterance.rate = rate;
        if (voice) {
          utterance.voice = voice as SpeechSynthesisVoice;
          utterance.lang = voice.lang;
        } else {
          utterance.lang = FALLBACK_TAG[segment.lang];
        }
        utterance.onboundary = (e) => {
          if (mine === generation && e.name === 'word') handlers.onWord?.(index, e.charIndex, e.charLength ?? 0);
        };
        utterance.onend = () => {
          if (mine !== generation) return;
          handlers.onSegmentEnd?.(index);
          if (position === playable.length - 1) {
            speaking = false;
            handlers.onEnd?.();
          }
        };
        utterance.onerror = () => {
          if (mine === generation) speaking = false;
        };
        synth.speak(utterance);
      });
    },
  };
}

export const shouldAutoSpeak = (mode: VoiceMode): boolean => mode === 'audio' || mode === 'both';
export const showSpeakerButtons = (mode: VoiceMode): boolean => mode === 'audio' || mode === 'both';

/** Lo que se usa del plugin de voz nativo (Android no trae voz en su WebView). */
export interface NativeTts {
  speak(options: { text: string; lang?: string; rate?: number }): Promise<void>;
  stop(): Promise<void>;
  addListener?(event: 'onRangeStart', listener: (info: { start: number; end: number; spokenWord: string }) => void): Promise<{ remove(): Promise<void> }>;
}

/**
 * Voz nativa de Android (motor de texto a voz del sistema) con la misma interfaz que la del navegador:
 * fragmento a fragmento, cada uno en su idioma, y aviso de cada palabra para resaltarla.
 * `languages` son las etiquetas que el teléfono tiene instaladas (vacía = no se sabe: se intenta igual).
 */
export function createNativeSpeaker(tts: NativeTts, rate = 0.9, languages: readonly string[] = []): Speaker {
  let speaking = false;
  let generation = 0;
  let current: { index: number; onWord?: SpeakHandlers['onWord']; mine: number } | null = null;
  void tts.addListener?.('onRangeStart', (info) => {
    if (current && current.mine === generation) current.onWord?.(current.index, info.start, info.end - info.start);
  });
  const voices = languages.map((lang) => ({ lang, name: lang }));
  const tagFor = (lang: Lang): string => (voices.length ? (pickVoice(voices, lang)?.lang ?? FALLBACK_TAG[lang]) : FALLBACK_TAG[lang]);

  const stop = (): void => {
    generation++;
    speaking = false;
    current = null;
    void tts.stop().catch(() => {});
  };

  return {
    available(lang) {
      return voices.length === 0 || pickVoice(voices, lang) !== null;
    },
    get speaking() {
      return speaking;
    },
    stop,
    speak(segments, handlers = {}) {
      stop();
      const mine = generation;
      const playable = segments.map((segment, index) => ({ segment, index })).filter(({ segment }) => segment.text.trim() && this.available(segment.lang));
      if (playable.length === 0) {
        handlers.onEnd?.();
        return;
      }
      speaking = true;
      void (async () => {
        for (const { segment, index } of playable) {
          if (mine !== generation) return;
          current = { index, onWord: handlers.onWord, mine };
          try {
            await tts.speak({ text: segment.text, lang: tagFor(segment.lang), rate });
          } catch {
            if (mine === generation) speaking = false;
            return;
          }
          if (mine !== generation) return;
          handlers.onSegmentEnd?.(index);
        }
        if (mine === generation) {
          speaking = false;
          current = null;
          handlers.onEnd?.();
        }
      })();
    },
  };
}

import { createContext, useContext } from 'react';
import { lessonText, type BiText, type Lang } from '@lucca/shared';
import { t } from '../i18n';
import type { Segment } from '../speaker';

/** Un texto bilingüe en el idioma pedido; las palabras de otro idioma llevan su `lang` (lector de pantalla y voz). */
export function T({ text, lang }: { text: BiText; lang: Lang }) {
  return (
    <>
      {text[lang].map((s, i) =>
        s.lang && s.lang !== lang ? (
          <span key={i} lang={s.lang}>
            {s.text}
          </span>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

export const plain = (text: BiText, lang: Lang): string => lessonText(text, lang);

/** Leer en voz alta al tocar un texto. `null` (modo «Leer») = el texto no es tocable. */
export const SayContext = createContext<((segments: Segment[]) => void) | null>(null);

/** Texto de la lección; con voz activa se puede tocar para oírlo (como en Khan Academy Kids). */
export function SayText({ text, lang, className = 'lesson-text' }: { text: BiText; lang: Lang; className?: string }) {
  const say = useContext(SayContext);
  if (!say) {
    return (
      <p className={className}>
        <T text={text} lang={lang} />
      </p>
    );
  }
  return (
    <button type="button" className={`${className} lesson-say`} aria-label={t(lang, 'lessonSay', { text: plain(text, lang) })} onClick={() => say(voiceOf(text, lang))}>
      <T text={text} lang={lang} />
    </button>
  );
}

/** Fragmentos para la voz: cada uno con su idioma. */
export const voiceOf = (text: BiText, lang: Lang): Segment[] => text[lang].map((s) => ({ text: s.text, lang: s.lang ?? lang }));

/** Barajado estable (mismo resultado para la misma lección) que nunca deja el orden original si hay más de un elemento. */
export function shuffled<T>(items: readonly T[], seed: string): T[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), h | 1);
    h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
  };
  const out = items.map((item, index) => ({ item, index }));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (out.length > 1 && out.every((o, i) => o.index === i)) out.push(out.shift()!);
  return out.map((o) => o.item);
}

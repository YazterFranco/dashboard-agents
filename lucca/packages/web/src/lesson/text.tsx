import { lessonText, type BiText, type Lang } from '@lucca/shared';
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

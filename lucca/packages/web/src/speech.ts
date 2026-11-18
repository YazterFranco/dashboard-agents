/** Une frases para leerlas en voz alta: cada una termina en un signo de puntuación. */
export function sentences(parts: (string | null)[]): string {
  return parts
    .filter((p): p is string => Boolean(p))
    .map((p) => (/[.!?…]$/.test(p.trim()) ? p.trim() : `${p.trim()}.`))
    .join(' ');
}

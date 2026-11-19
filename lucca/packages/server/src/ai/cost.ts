import type { Usage } from './generate.js';

/** Precios de Claude Opus 5.5 en USD por millón de tokens (lectura y escritura de caché incluidas). */
const PRICE = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 };

export function costUsd(u: Usage): number {
  return (u.inputTokens * PRICE.input + u.outputTokens * PRICE.output + u.cacheReadTokens * PRICE.cacheRead + u.cacheWriteTokens * PRICE.cacheWrite) / 1_000_000;
}

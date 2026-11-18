/** Resultado de enviar un avance al servidor: la estrella la decide él, la pantalla solo la muestra. */
export type ProgressResult = { ok: true; starsGained: number } | { ok: false };

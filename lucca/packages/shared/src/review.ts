import type { IsoDate } from './schemas.js';
import { addDays } from './week.js';

/**
 * Repaso rápido con práctica espaciada (cajas de Leitner). Recordar en días distintos ayuda más que repasar todo de
 * golpe. Acertar sube de caja (1 → 3 → 7 → 14 días); fallar vuelve a la caja 1 (mañana).
 */
const DAYS_FOR_BOX: Record<number, number> = { 1: 1, 2: 3, 3: 7, 4: 14 };
export const LEARNED_BOX = 4;
export const REVIEW_PER_DAY = 5;

export interface ReviewItem {
  id: string;
  box: number;
  dueDate: IsoDate;
}

export function nextReview(box: number, correct: boolean, today: IsoDate): { box: number; dueDate: IsoDate } {
  if (!correct) return { box: 1, dueDate: addDays(today, DAYS_FOR_BOX[1]) };
  const next = Math.min(LEARNED_BOX, box + 1);
  return { box: next, dueDate: addDays(today, DAYS_FOR_BOX[next]) };
}

/** Las que tocan hoy (o se quedaron atrás): primero las más antiguas y, a igual fecha, las menos sabidas. */
export function pickDue<T extends ReviewItem>(items: readonly T[], today: IsoDate, max = REVIEW_PER_DAY): T[] {
  return items
    .filter((i) => i.dueDate <= today)
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.box - b.box))
    .slice(0, max);
}

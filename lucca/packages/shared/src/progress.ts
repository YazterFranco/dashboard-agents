import { z } from 'zod';
import type { IsoDate, TaskStatus } from './schemas.js';
import { addDays, localDate } from './week.js';

export const PROGRESS_KINDS = ['lesson_step', 'lesson_done', 'practice_done', 'task_done', 'hint_used', 'help_requested'] as const;
export type ProgressKind = (typeof PROGRESS_KINDS)[number];
export const ProgressKindSchema = z.enum(PROGRESS_KINDS);

export interface ProgressEvent {
  id: string;
  taskId: string;
  kind: ProgressKind;
  /** Instante ISO en UTC. */
  at: string;
}

/** Terminar un paso grande da estrella; pedir pistas o avanzar de pantalla, no. */
export const STAR_KINDS: readonly ProgressKind[] = ['lesson_done', 'practice_done', 'task_done'];

/**
 * Estrellas de la semana lunes–domingo que empieza en `weekStart` (en la zona horaria `tz`):
 * una por cada pareja distinta tarea + tipo. Nunca restan.
 */
export function starsForWeek(events: readonly ProgressEvent[], weekStart: IsoDate, tz: string): number {
  const weekEnd = addDays(weekStart, 6);
  const earned = new Set<string>();
  for (const e of events) {
    if (!STAR_KINDS.includes(e.kind)) continue;
    const at = new Date(e.at);
    if (Number.isNaN(at.getTime())) continue;
    const day = localDate(at, tz);
    if (day < weekStart || day > weekEnd) continue;
    earned.add(`${e.taskId}:${e.kind}`);
  }
  return earned.size;
}

export function nextStatus(current: TaskStatus, kind: ProgressKind): TaskStatus {
  if (current === 'done') return 'done';
  if (kind === 'task_done') return 'done';
  if (current === 'todo' && (kind === 'lesson_step' || kind === 'lesson_done' || kind === 'practice_done' || kind === 'hint_used')) {
    return 'doing';
  }
  return current;
}

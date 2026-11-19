import { z } from 'zod';
import type { IsoDate, Task, TaskStatus } from './schemas.js';
import { weekTotals } from './guide.js';
import { addDays, localDate, weekDays, weekSummary } from './week.js';

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

export interface WeekProgress {
  weekStart: IsoDate;
  total: number;
  done: number;
  pending: number;
  stars: number;
  hints: number;
  helpRequests: number;
}

/** Eventos de ese tipo dentro de la semana lunes–domingo que empieza en `weekStart` (en la zona horaria `tz`). */
function eventsOfKind(events: readonly ProgressEvent[], kind: ProgressKind, weekStart: IsoDate, tz: string): ProgressEvent[] {
  const weekEnd = addDays(weekStart, 6);
  return events.filter((e) => {
    if (e.kind !== kind) return false;
    const at = new Date(e.at);
    if (Number.isNaN(at.getTime())) return false;
    const day = localDate(at, tz);
    return day >= weekStart && day <= weekEnd;
  });
}

/** Lo que papá ve de una semana: tareas, estrellas, pistas usadas y veces que Lucca pidió ayuda. */
export function weeklyProgress(tasks: Task[], events: readonly ProgressEvent[], weekStart: IsoDate, today: IsoDate, tz: string): WeekProgress {
  const { total, done, pending } = weekTotals(weekSummary(tasks, weekDays(weekStart), today));
  return {
    weekStart,
    total,
    done,
    pending,
    stars: starsForWeek(events, weekStart, tz),
    hints: eventsOfKind(events, 'hint_used', weekStart, tz).length,
    helpRequests: eventsOfKind(events, 'help_requested', weekStart, tz).length,
  };
}

/** Tareas en las que Lucca pidió ayuda esa semana, las más pedidas primero. Ignora tareas que ya no existen. */
export function needsHelp(tasks: Task[], events: readonly ProgressEvent[], weekStart: IsoDate, tz: string): { taskId: string; title: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of eventsOfKind(events, 'help_requested', weekStart, tz)) counts.set(e.taskId, (counts.get(e.taskId) ?? 0) + 1);
  return tasks
    .filter((t) => counts.has(t.id))
    .map((t) => ({ taskId: t.id, title: t.title, count: counts.get(t.id)! }))
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title, 'es'));
}

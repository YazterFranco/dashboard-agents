import { SUBJECTS, type IsoDate, type Task } from './schemas.js';
import { addDays, mondayOf, weekDays, weekSummary, type DaySummary, type DayTask } from './week.js';

/** Lunes de la semana desplazada `weeks` semanas; acepta cualquier día como entrada. */
export function shiftWeek(monday: IsoDate, weeks: number): IsoDate {
  return addDays(mondayOf(monday), weeks * 7);
}

export interface WeekTotals {
  total: number;
  done: number;
  pending: number;
}

export function weekTotals(summaries: DaySummary[]): WeekTotals {
  const total = summaries.reduce((n, s) => n + s.total, 0);
  const pending = summaries.reduce((n, s) => n + s.pending, 0);
  return { total, done: total - pending, pending };
}

/** Orden de la guía: solo lo que falta; primero lo ya empezado, luego lo urgente, luego por materia y título. */
export function guideOrder(items: DayTask[]): DayTask[] {
  const rank = (i: DayTask): number => (i.task.status === 'doing' ? 0 : i.urgent ? 1 : 2);
  return items
    .filter((i) => i.task.status !== 'done')
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        SUBJECTS.indexOf(a.task.subject) - SUBJECTS.indexOf(b.task.subject) ||
        a.task.title.localeCompare(b.task.title, 'es'),
    );
}

/**
 * Por dónde empezar en esa semana: hoy si tiene pendientes; si no, el primer día posterior con pendientes;
 * si no, el primer día anterior. Con `today` fuera de la semana, el primer día con pendientes.
 */
export function suggestedStart(summaries: DaySummary[], today: IsoDate): IsoDate | null {
  const dates = summaries.map((s) => s.date);
  const at = dates.indexOf(today);
  const order = at === -1 ? dates : [dates[at], ...dates.slice(at + 1), ...dates.slice(0, at)];
  const pending = (date: IsoDate): number => summaries.find((s) => s.date === date)?.pending ?? 0;
  return order.find((d) => pending(d) > 0) ?? null;
}

/** Día que queda seleccionado al ver una semana: hoy si cae en ella, si no por dónde empezar, si no el lunes. */
export function defaultDayOf(monday: IsoDate, tasks: Task[], today: IsoDate): IsoDate {
  const days = weekDays(monday);
  if (days.includes(today)) return today;
  return suggestedStart(weekSummary(tasks, days, today), today) ?? days[0];
}

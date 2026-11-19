import { SUBJECTS, type IsoDate, type Task } from './schemas.js';

/** Fecha local `YYYY-MM-DD` de un instante en la zona horaria dada (Panamá es UTC−5: de noche ya es "mañana" en UTC). */
export function localDate(now: Date, tz: string): IsoDate {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function toUtc(date: IsoDate): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** 0 = domingo … 6 = sábado. */
export function weekdayOf(date: IsoDate): number {
  return toUtc(date).getUTCDay();
}

export function addDays(date: IsoDate, n: number): IsoDate {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Lunes de la semana lunes–domingo que contiene `date`. */
export function mondayOf(date: IsoDate): IsoDate {
  return addDays(date, -((weekdayOf(date) + 6) % 7));
}

/** El día que Lucca ve al abrir: sábado y domingo apuntan al lunes siguiente. */
export function plannerToday(today: IsoDate): IsoDate {
  const wd = weekdayOf(today);
  if (wd === 6) return addDays(today, 2);
  if (wd === 0) return addDays(today, 1);
  return today;
}

/** Lunes a viernes de la semana que contiene `anchor`. */
export function weekDays(anchor: IsoDate): IsoDate[] {
  const monday = mondayOf(anchor);
  return [0, 1, 2, 3, 4].map((n) => addDays(monday, n));
}

export function previousSchoolDay(date: IsoDate): IsoDate {
  let d = addDays(date, -1);
  while (weekdayOf(d) === 0 || weekdayOf(d) === 6) d = addDays(d, -1);
  return d;
}

/** Día en que se trabaja la tarea: la fecha asignada, o el día escolar anterior a la entrega, o hoy si no hay fechas. */
export function workDateOf(t: Pick<Task, 'assignedDate' | 'dueDate'>, today: IsoDate): IsoDate {
  if (t.assignedDate) return t.assignedDate;
  if (t.dueDate) return previousSchoolDay(t.dueDate);
  return today;
}

export interface DayTask {
  task: Task;
  dueDate: IsoDate | null;
  urgent: boolean;
}

/**
 * Una tarea sin terminar no se queda atrás: si su día de trabajo ya pasó, aparece hoy. Es "urgente" solo si ya
 * venció (entrega hoy o antes); si todavía no vence, aparece hoy sin marca. Las terminadas se quedan en su día.
 */
function placement(t: Task, today: IsoDate): { date: IsoDate; urgent: boolean } {
  const work = workDateOf(t, today);
  if (t.status === 'done') return { date: work, urgent: false };
  const overdue = t.dueDate !== null && t.dueDate <= today;
  if (overdue) return { date: today, urgent: true };
  return { date: work < today ? today : work, urgent: false };
}

export function dayTasks(tasks: Task[], day: IsoDate, today: IsoDate): DayTask[] {
  return tasks
    .filter((t) => !t.hidden && !t.retired)
    .map((task) => ({ task, ...placement(task, today) }))
    .filter((p) => p.date === day)
    .sort(
      (a, b) =>
        SUBJECTS.indexOf(a.task.subject) - SUBJECTS.indexOf(b.task.subject) || a.task.title.localeCompare(b.task.title, 'es'),
    )
    .map((p) => ({ task: p.task, dueDate: p.task.dueDate, urgent: p.urgent }));
}

export interface DaySummary {
  date: IsoDate;
  total: number;
  pending: number;
  allDone: boolean;
}

export function weekSummary(tasks: Task[], days: IsoDate[], today: IsoDate): DaySummary[] {
  return days.map((date) => {
    const items = dayTasks(tasks, date, today);
    const pending = items.filter((i) => i.task.status !== 'done').length;
    return { date, total: items.length, pending, allDone: items.length > 0 && pending === 0 };
  });
}

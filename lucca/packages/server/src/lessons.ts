import { randomUUID } from 'node:crypto';
import { localDate, type Task } from '@lucca/shared';
import { costUsd } from './ai/cost.js';
import { generateLesson, type LessonModel } from './ai/generate.js';
import type { LuccaDb, LessonVariant, StoredLesson } from './db.js';

export type LessonAnswer =
  | { status: 'ready'; lesson: Pick<StoredLesson, 'doc' | 'variant' | 'source'> }
  | { status: 'unavailable'; reason: 'no-ai' | 'cap' | 'slow' }
  | { status: 'not-found' };

/** Diferencia entre la hora local de `tz` y UTC en ese instante (ms). */
function tzOffsetMs(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - at.getTime();
}

/** Instante (ISO) en que empezó el mes en curso en la zona horaria de la casa. */
export function monthStartIso(now: Date, tz: string): string {
  const [y, m] = localDate(now, tz).split('-').map(Number);
  const utcMidnight = Date.UTC(y, m - 1, 1);
  return new Date(utcMidnight - tzOffsetMs(new Date(utcMidnight), tz)).toISOString();
}

interface Deps {
  db: LuccaDb;
  model: LessonModel | null;
  /** La fuente de las lecciones, para guardarla ('recorded' si son las grabadas). */
  mode: 'live' | 'recorded' | 'off';
  now: () => Date;
  tz: string;
  /** Espera máxima para Lucca; la lección sigue preparándose y queda guardada para la próxima vez. */
  timeoutMs?: number;
}

/**
 * Lecciones «Entender»: se guardan y se reutilizan (abrir otra vez no llama a la IA), una sola generación a la vez por
 * tarea, con el tope mensual de gasto y una espera máxima amable para Lucca.
 */
export class LessonService {
  private inFlight = new Map<string, Promise<StoredLesson>>();
  constructor(private readonly deps: Deps) {}

  monthCostUsd(): number {
    return this.deps.db.aiCostSince(monthStartIso(this.deps.now(), this.deps.tz));
  }

  /** `forParent`: papá también puede ver la lección de una tarea oculta. */
  async get(taskId: string, variant: LessonVariant, opts: { forParent?: boolean } = {}): Promise<LessonAnswer> {
    const { db } = this.deps;
    const task = db.getTask(taskId);
    if (!task || task.retired || (task.hidden && !opts.forParent)) return { status: 'not-found' };
    const stored = db.getLesson(taskId, variant);
    if (stored) return ready(stored);
    if (!this.deps.model) return { status: 'unavailable', reason: 'no-ai' };
    const key = `${taskId}:${variant}`;
    let job = this.inFlight.get(key);
    if (!job) {
      if (this.monthCostUsd() >= db.getSettings().aiMonthlyCapUsd) return { status: 'unavailable', reason: 'cap' };
      job = this.create(task, variant).finally(() => this.inFlight.delete(key));
      this.inFlight.set(key, job);
    }
    const timeout = this.deps.timeoutMs ?? 60_000;
    let timer: NodeJS.Timeout | undefined;
    const slow = new Promise<'slow'>((resolve) => (timer = setTimeout(() => resolve('slow'), timeout)));
    try {
      const out = await Promise.race([job, slow]);
      return out === 'slow' ? { status: 'unavailable', reason: 'slow' } : ready(out);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Papá pide otra versión: se borran las guardadas y se genera de nuevo. */
  async regenerate(taskId: string): Promise<LessonAnswer> {
    const task = this.deps.db.getTask(taskId);
    if (!task || task.retired) return { status: 'not-found' };
    this.deps.db.deleteLessons(taskId);
    return this.get(taskId, 'default', { forParent: true });
  }

  private async create(task: Task, variant: LessonVariant): Promise<StoredLesson> {
    const { db, model, now } = this.deps;
    const settings = db.getSettings();
    const out = await generateLesson(model!, {
      task: { subject: task.subject, title: task.title, titleEn: task.titleTranslations.en ?? '', description: task.description },
      grade: settings.grade,
      variant,
    });
    for (const usage of out.usage) {
      db.addAiUsage({ id: randomUUID(), at: now().toISOString(), taskId: task.id, purpose: `lesson:${variant}`, usage, costUsd: costUsd(usage) });
    }
    const lesson: StoredLesson = {
      taskId: task.id,
      variant,
      doc: out.doc,
      source: out.source === 'fallback' ? 'fallback' : this.deps.mode === 'recorded' ? 'recorded' : 'ai',
      issues: out.issues,
      createdAt: now().toISOString(),
    };
    db.saveLesson(lesson);
    return lesson;
  }
}

const ready = (l: StoredLesson): LessonAnswer => ({ status: 'ready', lesson: { doc: l.doc, variant: l.variant, source: l.source } });

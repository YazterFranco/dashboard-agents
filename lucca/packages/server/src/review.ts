import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LEARNED_BOX, addDays, localDate, mondayOf, nextReview, pickDue, starsForWeek } from '@lucca/shared';
import type { Config } from './config.js';
import type { LuccaDb, StoredReviewItem } from './db.js';

/** Al terminar una lección, sus preguntas pasan al repaso de mañana (si ya estaban, se quedan como iban). */
export function addLessonToReview(db: LuccaDb, taskId: string, today: string): void {
  const task = db.getTask(taskId);
  const lesson = db.getLesson(taskId, 'default') ?? db.getLesson(taskId, 'alternative');
  if (!task || !lesson) return;
  lesson.doc.quiz.forEach((question, i) => {
    db.addReviewItem({ id: `${taskId}:${lesson.variant}:${i}`, taskId, subject: task.subject, taskTitle: task.title, question, dueDate: addDays(today, 1) });
  });
}

/** Solo preguntas de tareas que Lucca puede ver (papá puede ocultar una tarea y su repaso con ella). */
export function visibleReviewItems(db: LuccaDb): StoredReviewItem[] {
  const visible = new Set(db.listTasks().filter((t) => !t.hidden && !t.retired).map((t) => t.id));
  return db.listReviewItems().filter((i) => visible.has(i.taskId));
}

export function reviewSummary(db: LuccaDb, today: string) {
  const items = visibleReviewItems(db);
  return { total: items.length, learned: items.filter((i) => i.box >= LEARNED_BOX).length, due: pickDue(items, today).length };
}

const AnswerSchema = z.object({ correct: z.boolean() });
const reviewTaskId = (today: string) => `review-${today}`;

export function registerReviewRoutes(app: FastifyInstance, deps: { db: LuccaDb; config: Config; now: () => Date }): void {
  const { db, config, now } = deps;
  const today = () => localDate(now(), config.tz);
  const stars = () => starsForWeek(db.listProgress(), mondayOf(today()), config.tz);

  app.get('/api/kid/review', async () => {
    const day = today();
    const items = pickDue(visibleReviewItems(db), day).map(({ id, subject, taskTitle, question }) => ({ id, subject, taskTitle, question }));
    return { today: day, items, doneToday: db.hasProgress(reviewTaskId(day), 'practice_done') };
  });

  app.post<{ Params: { id: string } }>('/api/kid/review/:id', async (req, reply) => {
    const body = AnswerSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'solicitud inválida' });
    const item = db.getReviewItem(req.params.id);
    if (!item) return reply.code(404).send({ error: 'pregunta no encontrada' });
    const day = today();
    // Una respuesta por pregunta y día: contestar dos veces no la hace saltar dos cajas.
    if (item.lastSeen === day) return { box: item.box, dueDate: item.dueDate };
    const next = nextReview(item.box, body.data.correct, day);
    db.updateReviewItem(item.id, next.box, next.dueDate, day);
    return next;
  });

  app.post('/api/kid/review/finish', async (_req, reply) => {
    const day = today();
    if (!db.listReviewItems().some((i) => i.lastSeen === day)) return reply.code(400).send({ error: 'no hay repaso hoy' });
    const taskId = reviewTaskId(day);
    const starGained = !db.hasProgress(taskId, 'practice_done');
    if (starGained) db.addProgress({ id: `${taskId}-done`, taskId, kind: 'practice_done', at: now().toISOString() });
    return { starGained, starsThisWeek: stars() };
  });
}

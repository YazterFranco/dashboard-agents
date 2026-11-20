import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { z } from 'zod';
import {
  KidStateSchema,
  ProgressKindSchema,
  STAR_KINDS,
  localDate,
  mondayOf,
  nextStatus,
  starsForWeek,
  type KidState,
} from '@lucca/shared';
import type { Config } from './config.js';
import type { LuccaDb } from './db.js';
import { LoginThrottle } from './auth.js';
import { registerParentRoutes } from './parent.js';
import Anthropic from '@anthropic-ai/sdk';
import { ClaudeLessonModel } from './ai/claude.js';
import type { LessonModel } from './ai/generate.js';
import { RecordedLessonModel } from './ai/recorded.js';
import { LessonService } from './lessons.js';
import { addLessonToReview, registerReviewRoutes, reviewSummary } from './review.js';
import { isPrivateAddress } from './privateNet.js';

export const VERSION = '0.1.0';

export interface BuildAppOptions {
  db: LuccaDb;
  config: Config;
  /** Reloj inyectable para las pruebas. */
  now?: () => Date;
  logger?: boolean;
  /** Fuente de lecciones; si no se da, sale de `config.aiMode`. `null` = sin IA. */
  lessonModel?: LessonModel | null;
  lessonTimeoutMs?: number;
}

/** La fuente de lecciones según la configuración. La clave la lee el SDK del entorno; nunca pasa por aquí. */
export function lessonModelFor(config: Config): LessonModel | null {
  if (config.aiMode === 'recorded') return new RecordedLessonModel();
  if (config.aiMode === 'live') return new ClaudeLessonModel(new Anthropic());
  return null;
}

const VariantSchema = z.object({ variant: z.enum(['default', 'alternative']).default('default') });

const ProgressBodySchema = z.object({ taskId: z.string().min(1), kind: ProgressKindSchema });

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const { db, config } = opts;
  const now = opts.now ?? (() => new Date());
  const app = Fastify({ bodyLimit: 16 * 1024, logger: opts.logger ?? false });

  // Solo la propia computadora o la red de la casa. Es la protección principal: no abras el puerto en el router.
  app.addHook('onRequest', async (req, reply) => {
    if (!isPrivateAddress(req.ip)) return reply.code(403).send({ error: 'solo red local' });
  });

  const starsNow = (): number => {
    const today = localDate(now(), config.tz);
    return starsForWeek(db.listProgress(), mondayOf(today), config.tz);
  };

  app.get('/api/health', async () => ({
    ok: true,
    version: VERSION,
    db: 'ok',
    ai: config.aiConfigured ? 'configured' : 'unconfigured',
  }));

  app.get('/api/kid/state', async (): Promise<KidState> => {
    const today = localDate(now(), config.tz);
    return KidStateSchema.parse({
      today,
      weekStart: mondayOf(today),
      settings: { ...db.getSettings(), tz: config.tz },
      tasks: db.listTasks().filter((t) => !t.hidden && !t.retired),
      starsThisWeek: starsNow(),
      reviewDue: reviewSummary(db, today).due,
    });
  });

  app.post('/api/kid/progress', async (req, reply) => {
    const body = ProgressBodySchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'solicitud inválida' });
    const task = db.getTask(body.data.taskId);
    if (!task || task.hidden || task.retired) return reply.code(404).send({ error: 'tarea no encontrada' });

    // Una estrella se gana una sola vez por tarea y tipo: repetir "¡Terminé!" (un reintento de red, o repasar
    // una tarea ya hecha otra semana) no suma otra. Los demás eventos (pistas, pasos) siempre se registran.
    const alreadyEarned = STAR_KINDS.includes(body.data.kind) && db.hasProgress(task.id, body.data.kind);
    if (!alreadyEarned) db.addProgress({ id: randomUUID(), taskId: task.id, kind: body.data.kind, at: now().toISOString() });
    const status = nextStatus(task.status, body.data.kind);
    if (status !== task.status) db.setTaskStatus(task.id, status);
    if (body.data.kind === 'lesson_done') addLessonToReview(db, task.id, localDate(now(), config.tz));
    return { status, starsThisWeek: starsNow() };
  });

  const lessons = new LessonService({
    db,
    model: opts.lessonModel === undefined ? lessonModelFor(config) : opts.lessonModel,
    mode: config.aiMode,
    now,
    tz: config.tz,
    timeoutMs: opts.lessonTimeoutMs,
  });

  // «Entender»: la lección de una tarea (la guardada, o se prepara ahora con una espera máxima).
  app.get<{ Params: { taskId: string } }>('/api/kid/lessons/:taskId', async (req, reply) => {
    const q = VariantSchema.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: 'solicitud inválida' });
    const answer = await lessons.get(req.params.taskId, q.data.variant);
    if (answer.status === 'not-found') return reply.code(404).send({ error: 'tarea no encontrada' });
    return answer;
  });

  registerReviewRoutes(app, { db, config, now });
  registerParentRoutes(app, { db, config, now, throttle: new LoginThrottle(), lessons });

  if (config.webDir && existsSync(config.webDir)) {
    await app.register(fastifyStatic, { root: config.webDir });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) return reply.sendFile('index.html');
      return reply.code(404).send({ error: 'no encontrado' });
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'no encontrado' }));
  }

  return app;
}

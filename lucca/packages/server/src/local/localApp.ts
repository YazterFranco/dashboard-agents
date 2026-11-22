import type { FastifyInstance } from 'fastify';
import type { Config } from '../config.js';
import type { LuccaDb } from '../db.js';
import type { LessonModel } from '../ai/generate.js';
import { registerApi } from '../routes.js';
import { MiniFastify } from './miniFastify.js';

export interface LocalAppOptions {
  db: LuccaDb;
  config: Config;
  now?: () => Date;
  lessonModel: LessonModel | null;
  lessonTimeoutMs?: number;
}

/** La API completa dentro de la app: las mismas rutas que el servidor, sobre `MiniFastify`. */
export function buildLocalApp(opts: LocalAppOptions): MiniFastify {
  const app = new MiniFastify();
  registerApi(app as unknown as FastifyInstance, {
    db: opts.db,
    config: opts.config,
    now: opts.now ?? (() => new Date()),
    lessonModel: opts.lessonModel,
    lessonTimeoutMs: opts.lessonTimeoutMs,
  });
  return app;
}

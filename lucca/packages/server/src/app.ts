import { existsSync } from 'node:fs';
import { createHash, timingSafeEqual } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { Config } from './config.js';
import type { LuccaDb } from './db.js';
import type { LessonModel } from './ai/generate.js';
import { lessonModelFor } from './aiModel.js';
import { isPrivateAddress } from './privateNet.js';
import { registerApi } from './routes.js';

export { VERSION } from './routes.js';
export { lessonModelFor } from './aiModel.js';

/** Cabecera con la que el Worker de Cloudflare demuestra que la petición pasó por él. */
export const ORIGIN_HEADER = 'x-lucca-origin';

/** Comparación en tiempo constante (no revela cuántos caracteres coinciden). */
function sameSecret(given: string | string[] | undefined, expected: string): boolean {
  if (typeof given !== 'string') return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

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

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const { db, config } = opts;
  const now = opts.now ?? (() => new Date());
  const app = Fastify({ bodyLimit: 16 * 1024, logger: opts.logger ?? false });

  const fromOrigin = (req: FastifyRequest): boolean => config.originSecret !== null && sameSecret(req.headers[ORIGIN_HEADER], config.originSecret);

  if (config.originSecret === null) {
    // Solo la propia computadora o la red de la casa. Es la protección principal: no abras el puerto en el router.
    app.addHook('onRequest', async (req, reply) => {
      if (!isPrivateAddress(req.ip)) return reply.code(403).send({ error: 'solo red local' });
    });
  } else {
    // Publicado: solo lo que llega por el Worker de Cloudflare (que ya pasó por Cloudflare Access) trae la cabecera.
    // La comprobación de salud de Railway entra sin ella, pero sin detalles.
    app.addHook('onRequest', async (req, reply) => {
      if (fromOrigin(req)) return;
      if (req.method === 'GET' && req.url === '/api/health') return reply.send({ ok: true });
      return reply.code(403).send({ error: 'acceso no permitido' });
    });
  }

  registerApi(app, {
    db,
    config,
    now,
    lessonModel: opts.lessonModel === undefined ? lessonModelFor(config) : opts.lessonModel,
    lessonTimeoutMs: opts.lessonTimeoutMs,
  });

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

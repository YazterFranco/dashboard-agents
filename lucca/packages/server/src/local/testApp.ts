/**
 * Solo para pruebas: el mismo `buildApp` que usan las pruebas de la API, pero sobre la app (MiniFastify) en lugar de
 * Fastify. La configuración de vitest «app» lo pone en lugar de `src/app.ts`, y así todas las pruebas de la API
 * comprueban también el modo app.
 */
import type { BuildAppOptions } from '../app.js';
import { lessonModelFor } from '../aiModel.js';
import { buildLocalApp } from './localApp.js';

export { VERSION } from '../routes.js';
export { lessonModelFor } from '../aiModel.js';
export const ORIGIN_HEADER = 'x-lucca-origin';

interface InjectOptions {
  method: string;
  url: string;
  payload?: unknown;
  headers?: Record<string, string>;
  remoteAddress?: string;
}

export async function buildApp(opts: BuildAppOptions) {
  const app = buildLocalApp({
    db: opts.db,
    config: opts.config,
    now: opts.now,
    lessonModel: opts.lessonModel === undefined ? lessonModelFor(opts.config) : opts.lessonModel,
    lessonTimeoutMs: opts.lessonTimeoutMs,
  });
  return {
    async inject(o: InjectOptions) {
      const headers: Record<string, string> = { ...(o.headers ?? {}) };
      let body: Uint8Array | string | null = null;
      if (o.payload !== undefined) {
        if (typeof o.payload === 'string') body = o.payload;
        else if (o.payload instanceof Uint8Array) body = o.payload;
        else {
          body = JSON.stringify(o.payload);
          if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) headers['content-type'] = 'application/json';
        }
      }
      const res = await app.handle({ method: o.method, url: o.url, headers, body });
      return {
        statusCode: res.statusCode,
        headers: res.headers,
        body: res.body,
        payload: res.body,
        json: () => JSON.parse(res.body),
      };
    },
    close: () => app.close(),
  };
}

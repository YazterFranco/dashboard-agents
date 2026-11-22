/**
 * El «servidor» de la app de Android, dentro del propio dispositivo: las mismas rutas que el servidor de casa
 * (registerApi), con SQLite en WebAssembly (sql.js) guardado en el dispositivo. Sin red, salvo la IA si hay clave.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { Config } from '../../../server/src/config';
import { LuccaDb } from '../../../server/src/db';
import { sqlJsHandle, type SqlJsDatabaseLike } from '../../../server/src/sqlHandle';
import { buildLocalApp } from '../../../server/src/local/localApp';
import type { LocalRequestInit, LocalResponse, MiniFastify } from '../../../server/src/local/miniFastify';
import { ClaudeLessonModel } from '../../../server/src/ai/claude';
import { RecordedLessonModel } from '../../../server/src/ai/recorded';
import type { LessonModel } from '../../../server/src/ai/generate';
import { COOKIE_NAME, SESSION_IDLE_MS, readCookie, tokenId } from '../../../server/src/auth';
import type { KeyValueStore } from './storage';

export const DB_KEY = 'db';
export const AI_KEY = 'ai-key';
export const MEREB_KEY = 'mereb-url';

export interface SqlJsStatic {
  Database: new (data?: Uint8Array) => SqlJsDatabaseLike & { export(): Uint8Array };
}

export interface BackendOptions {
  store: KeyValueStore;
  sql: SqlJsStatic;
  now?: () => Date;
  /** Para pruebas: otra fuente de lecciones en lugar de Claude o las grabadas. */
  lessonModelFor?: (aiKey: string | null) => LessonModel | null;
  /** Espera antes de guardar tras un cambio (agrupa varios cambios seguidos). */
  saveDelayMs?: number;
}

export interface AppBackend {
  handle(init: LocalRequestInit): Promise<LocalResponse>;
  /** Guarda ya lo pendiente (al pasar la app a segundo plano). */
  flush(): Promise<void>;
}

/** Datos de la app que papá configura (además de los ajustes de siempre). */
export interface AppConfigView {
  aiKeySet: boolean;
  /** Los últimos 4 caracteres, para reconocerla sin mostrarla. */
  aiKeyHint: string | null;
  merebUrl: string | null;
}

const asString = (v: Uint8Array | string | null): string | null => (typeof v === 'string' && v ? v : null);

function defaultLessonModel(aiKey: string | null): LessonModel {
  // Sin clave, las lecciones grabadas: la app sirve desde el primer momento. Con clave, Claude prepara cada lección.
  if (!aiKey) return new RecordedLessonModel();
  return new ClaudeLessonModel(new Anthropic({ apiKey: aiKey, dangerouslyAllowBrowser: true }));
}

function appConfig(aiKey: string | null, merebUrl: string | null): Config {
  return {
    host: '',
    port: 0,
    dbPath: 'app',
    tz: 'America/Panama',
    demo: false,
    webDir: null,
    publicUrl: null,
    aiConfigured: Boolean(aiKey),
    merebConfigured: Boolean(merebUrl),
    aiMode: aiKey ? 'live' : 'recorded',
    originSecret: null,
  };
}

const json = (statusCode: number, body: unknown): LocalResponse => ({
  statusCode,
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
});

export function validMerebUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'https:' ? url.toString().replace(/\/+$/, '') : null;
  } catch {
    return null;
  }
}

export async function startBackend(opts: BackendOptions): Promise<AppBackend> {
  const { store, sql } = opts;
  const now = opts.now ?? (() => new Date());
  const stored = await store.get(DB_KEY);
  const raw = new sql.Database(stored instanceof Uint8Array ? stored : undefined);

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let saving: Promise<void> = Promise.resolve();
  const save = () => {
    saveTimer = null;
    const bytes = raw.export();
    saving = saving.then(() => store.set(DB_KEY, bytes));
    return saving;
  };
  const scheduleSave = () => {
    if (saveTimer === null) saveTimer = setTimeout(() => void save(), opts.saveDelayMs ?? 120);
  };

  const db = new LuccaDb(sqlJsHandle(raw, scheduleSave));
  let aiKey = asString(await store.get(AI_KEY));
  let merebUrl = asString(await store.get(MEREB_KEY));
  const modelFor = opts.lessonModelFor ?? defaultLessonModel;

  let app: MiniFastify;
  const rebuild = () => {
    app = buildLocalApp({ db, config: appConfig(aiKey, merebUrl), now, lessonModel: modelFor(aiKey) });
  };
  rebuild();

  /** Las rutas propias de la app (clave de IA y Mereb) piden la misma sesión de papá que su área. */
  const parentSession = (init: LocalRequestInit): boolean => {
    const cookie = Object.entries(init.headers ?? {}).find(([k]) => k.toLowerCase() === 'cookie')?.[1];
    const token = readCookie(cookie, COOKIE_NAME);
    if (!token) return false;
    const session = db.getSession(tokenId(token));
    return Boolean(session && now().getTime() - Date.parse(session.lastSeen) <= SESSION_IDLE_MS);
  };

  const view = (): AppConfigView => ({ aiKeySet: Boolean(aiKey), aiKeyHint: aiKey ? aiKey.slice(-4) : null, merebUrl });

  async function appRoute(init: LocalRequestInit): Promise<LocalResponse> {
    if (!parentSession(init)) return json(401, { error: 'Hace falta el PIN' });
    if (init.method === 'GET') return json(200, view());
    if (init.method !== 'PUT') return json(404, { error: 'no encontrado' });
    let body: { aiKey?: unknown; merebUrl?: unknown };
    try {
      const text = typeof init.body === 'string' ? init.body : new TextDecoder().decode(init.body ?? new Uint8Array());
      body = JSON.parse(text || '{}');
    } catch {
      return json(400, { error: 'Datos inválidos' });
    }
    const fields: Record<string, string> = {};
    let nextKey = aiKey;
    let nextMereb = merebUrl;
    if (body.aiKey !== undefined) {
      if (body.aiKey === null || body.aiKey === '') nextKey = null;
      else if (typeof body.aiKey === 'string' && /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(body.aiKey.trim())) nextKey = body.aiKey.trim();
      else fields.aiKey = 'La clave de IA empieza por «sk-ant-»: cópiala completa desde console.anthropic.com';
    }
    if (body.merebUrl !== undefined) {
      if (body.merebUrl === null || body.merebUrl === '') nextMereb = null;
      else if (typeof body.merebUrl === 'string' && validMerebUrl(body.merebUrl)) nextMereb = validMerebUrl(body.merebUrl);
      else fields.merebUrl = 'Escribe la dirección de Mereb completa, empezando por https://';
    }
    if (Object.keys(fields).length) return json(400, { error: 'Datos inválidos', fields });
    if (nextKey !== aiKey) {
      aiKey = nextKey;
      if (aiKey) await store.set(AI_KEY, aiKey);
      else await store.delete(AI_KEY);
    }
    if (nextMereb !== merebUrl) {
      merebUrl = nextMereb;
      if (merebUrl) await store.set(MEREB_KEY, merebUrl);
      else await store.delete(MEREB_KEY);
    }
    rebuild();
    return json(200, view());
  }

  return {
    async handle(init) {
      const path = new URL(init.url, 'http://lucca.local').pathname;
      if (path === '/api/app/config') return appRoute(init);
      return app.handle(init);
    },
    async flush() {
      if (saveTimer !== null) {
        clearTimeout(saveTimer);
        await save();
      }
      await saving;
    },
  };
}

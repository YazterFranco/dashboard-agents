import { readFileSync } from 'node:fs';
import initSqlJs from 'sql.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { RecordedLessonModel } from '../../../server/src/ai/recorded';
import { AI_KEY, DB_KEY, MEREB_KEY, startBackend, validMerebUrl, type SqlJsStatic } from './backend';
import { cookieJar, localFetch } from './fetchShim';
import { memoryStore } from './storage';

let sql: SqlJsStatic;
beforeAll(async () => {
  sql = (await initSqlJs()) as unknown as SqlJsStatic;
});

const NOW = () => new Date('2026-11-18T17:00:00Z');
const SETUP = { pin: '482913', childName: 'Lucca', grade: 2, lang: 'es', theme: 'dark' };
const KEY = 'sk-ant-api03-' + 'x'.repeat(40) + 'WXYZ';

async function boot(store = memoryStore(), lessonModelFor = vi.fn(() => new RecordedLessonModel())) {
  const backend = await startBackend({ store, sql, now: NOW, lessonModelFor, saveDelayMs: 0 });
  const jar = cookieJar(null);
  const real = vi.fn(async () => new Response('red'));
  const f = localFetch(backend, jar, real as unknown as typeof fetch, 'https://localhost');
  const call = (path: string, init: RequestInit = {}) => f(`https://localhost${path}`, init);
  const send = (method: string, path: string, body?: unknown) =>
    call(path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { backend, store, call, send, real, jar, lessonModelFor };
}

describe('servidor interno de la app: positivo', () => {
  it('atiende la API sin red: configurar, crear una tarea y verla como Lucca', async () => {
    const { send, call, real } = await boot();
    expect((await send('POST', '/api/parent/setup', SETUP)).status).toBe(201);
    expect((await send('POST', '/api/parent/tasks', { subject: 'math', title: 'Sumas', assignedDate: '2026-11-18' })).status).toBe(201);
    const state = await (await call('/api/kid/state')).json();
    expect(state.tasks.map((t: { title: string }) => t.title)).toEqual(['Sumas']);
    expect(real).not.toHaveBeenCalled();
  });

  it('lo guardado sigue ahí al cerrar y volver a abrir la app', async () => {
    const first = await boot();
    await first.send('POST', '/api/parent/setup', SETUP);
    await first.send('POST', '/api/parent/tasks', { subject: 'science', title: 'Plantas' });
    await first.backend.flush();
    expect(first.store.data.get(DB_KEY)).toBeInstanceOf(Uint8Array);

    const again = await boot(first.store);
    const state = await (await again.call('/api/kid/state')).json();
    expect(state.tasks.map((t: { title: string }) => t.title)).toEqual(['Plantas']);
    const status = await (await again.call('/api/parent/status')).json();
    expect(status).toMatchObject({ setupDone: true, authenticated: false });
    const login = await again.send('POST', '/api/parent/login', { pin: '482913' });
    expect(login.status).toBe(200);
  });

  it('el PDF de la agenda se lee dentro de la app', async () => {
    const { send, call } = await boot();
    await send('POST', '/api/parent/setup', SETUP);
    const pdf = readFileSync(new URL('../../../server/test/fixtures/mereb/agenda-ficticia.pdf', import.meta.url));
    const res = await call('/api/parent/agenda/pdf', { method: 'POST', headers: { 'content-type': 'application/pdf' }, body: new Blob([pdf]) });
    expect(res.status).toBe(200);
    const preview = await res.json();
    expect(preview.drafts).toHaveLength(5);
  });

  it('papá guarda la clave de IA y la dirección de Mereb; solo se ven los últimos 4 caracteres', async () => {
    const { send, call, store, lessonModelFor } = await boot();
    await send('POST', '/api/parent/setup', SETUP);
    const res = await send('PUT', '/api/app/config', { aiKey: KEY, merebUrl: 'https://colegio.mereb.example/' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ aiKeySet: true, aiKeyHint: 'WXYZ', merebUrl: 'https://colegio.mereb.example' });
    expect(store.data.get(AI_KEY)).toBe(KEY);
    expect(store.data.get(MEREB_KEY)).toBe('https://colegio.mereb.example');
    expect(lessonModelFor).toHaveBeenLastCalledWith(KEY);
    const overview = await (await call('/api/parent/overview')).json();
    expect(overview.connections).toEqual({ ai: true, mereb: true });
    expect(JSON.stringify(overview)).not.toContain(KEY);
  });

  it('quitar la clave vuelve a las lecciones sin IA', async () => {
    const { send, store, lessonModelFor } = await boot(memoryStore({ [AI_KEY]: KEY }));
    expect(lessonModelFor).toHaveBeenLastCalledWith(KEY);
    await send('POST', '/api/parent/setup', SETUP);
    await send('PUT', '/api/app/config', { aiKey: null });
    expect(store.data.has(AI_KEY)).toBe(false);
    expect(lessonModelFor).toHaveBeenLastCalledWith(null);
  });
});

describe('servidor interno de la app: negativo', () => {
  it('sin el PIN de papá no se lee ni se cambia la configuración de la app', async () => {
    const { send, call, jar } = await boot();
    await send('POST', '/api/parent/setup', SETUP);
    jar.store('lucca_parent=; Max-Age=0');
    expect((await call('/api/app/config')).status).toBe(401);
    expect((await send('PUT', '/api/app/config', { aiKey: KEY })).status).toBe(401);
  });

  it('una clave o una dirección mal escritas se rechazan con un mensaje claro', async () => {
    const { send } = await boot();
    await send('POST', '/api/parent/setup', SETUP);
    const res = await send('PUT', '/api/app/config', { aiKey: 'hola', merebUrl: 'http://inseguro.example' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fields.aiKey).toMatch(/sk-ant-/);
    expect(body.fields.merebUrl).toMatch(/https:\/\//);
  });

  it('una ruta que no existe es 404 en JSON, como en el servidor', async () => {
    const { call } = await boot();
    const res = await call('/api/no-existe');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no encontrado' });
  });
});

describe('servidor interno de la app: bordes', () => {
  it('lo que no es /api va a la red de verdad (por ejemplo la IA)', async () => {
    const { real } = await boot();
    const backend = await startBackend({ store: memoryStore(), sql, now: NOW, saveDelayMs: 0 });
    const f = localFetch(backend, cookieJar(null), real as unknown as typeof fetch, 'https://localhost');
    await f('https://api.anthropic.com/v1/messages', { method: 'POST' });
    await f('https://localhost/assets/app.js');
    expect(real).toHaveBeenCalledTimes(2);
  });

  it('salir borra la cookie de papá del tarro', async () => {
    const { send, jar } = await boot();
    await send('POST', '/api/parent/setup', SETUP);
    expect(jar.header()).toMatch(/^lucca_parent=/);
    await send('POST', '/api/parent/logout');
    expect(jar.header()).toBeNull();
  });

  it('una base guardada dañada no deja la app sin abrir: falla claro', async () => {
    await expect(boot(memoryStore({ [DB_KEY]: new Uint8Array([1, 2, 3]) }))).rejects.toThrow();
  });

  it('validMerebUrl solo acepta https', () => {
    expect(validMerebUrl('https://a.example/x/')).toBe('https://a.example/x');
    expect(validMerebUrl('http://a.example')).toBeNull();
    expect(validMerebUrl('no es url')).toBeNull();
  });
});

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ChangePinBodySchema, LoginBodySchema, PinSchema, SetupBodySchema, fieldErrors } from '@lucca/shared';
import {
  COOKIE_NAME,
  SESSION_IDLE_MS,
  clearedCookie,
  hashPin,
  newToken,
  readCookie,
  sessionCookie,
  tokenId,
  verifyPin,
  type LoginThrottle,
} from './auth.js';
import type { Config } from './config.js';
import type { LuccaDb } from './db.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Identificador (sha256 del token) de la sesión del padre que hizo la petición. */
    parentSessionId?: string;
  }
}

export interface ParentDeps {
  db: LuccaDb;
  config: Config;
  now: () => Date;
  throttle: LoginThrottle;
}

const NEEDS_PIN = { error: 'Hace falta el PIN' };

/** Rutas del área de papá: acceso (sin sesión) y, dentro de un ámbito propio, todo lo que exige sesión. */
export function registerParentRoutes(app: FastifyInstance, deps: ParentDeps): void {
  const { db, config, now, throttle } = deps;
  const nowMs = (): number => now().getTime();
  const connections = () => ({ ai: config.aiConfigured, mereb: config.merebConfigured });

  /** La sesión de la petición, o null si no hay cookie, no existe o pasó el tiempo sin actividad (entonces se borra). */
  const sessionIdOf = (req: FastifyRequest, touch: boolean): string | null => {
    const token = readCookie(req.headers.cookie, COOKIE_NAME);
    if (!token) return null;
    const id = tokenId(token);
    const session = db.getSession(id);
    if (!session) return null;
    if (nowMs() - Date.parse(session.lastSeen) > SESSION_IDLE_MS) {
      db.deleteSession(id);
      return null;
    }
    if (touch) db.touchSession(id, now().toISOString());
    return id;
  };

  const openSession = (reply: FastifyReply): void => {
    db.deleteSessionsIdleSince(new Date(nowMs() - SESSION_IDLE_MS).toISOString());
    const token = newToken();
    db.createSession(tokenId(token), now().toISOString());
    reply.header('set-cookie', sessionCookie(token));
  };

  const locked = (reply: FastifyReply, retryAfterSeconds: number) =>
    reply.code(423).header('retry-after', String(retryAfterSeconds)).send({ error: 'Demasiados intentos', retryAfterSeconds });

  app.get('/api/parent/status', async (req) => {
    const t = throttle.status(nowMs());
    return {
      setupDone: db.getPinRecord() !== null,
      authenticated: sessionIdOf(req, false) !== null,
      locked: t.locked,
      retryAfterSeconds: t.retryAfterSeconds,
      connections: connections(),
    };
  });

  // La configuración inicial se hace una sola vez. Mientras no haya PIN, la puede hacer cualquiera de la red de casa:
  // conviene hacerla justo después del primer arranque.
  app.post('/api/parent/setup', async (req, reply) => {
    if (db.getPinRecord() !== null) return reply.code(409).send({ error: 'La configuración ya se hizo' });
    const body = SetupBodySchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos inválidos', fields: fieldErrors(body.error) });
    const { pin, ...child } = body.data;
    db.setSettings(child);
    db.setPinRecord(hashPin(pin));
    openSession(reply);
    return reply.code(201).send({ ok: true });
  });

  app.post('/api/parent/login', async (req, reply) => {
    const record = db.getPinRecord();
    if (record === null) return reply.code(409).send({ error: 'Falta la configuración inicial' });
    const body = LoginBodySchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos inválidos', fields: fieldErrors(body.error) });
    // Un PIN con formato inválido no es un intento: no gasta ninguno de los 5.
    const format = PinSchema.safeParse(body.data.pin);
    if (!format.success) return reply.code(400).send({ error: 'Datos inválidos', fields: fieldErrors(format.error, 'pin') });
    const state = throttle.status(nowMs());
    if (state.locked) return locked(reply, state.retryAfterSeconds);
    if (!verifyPin(body.data.pin, record)) {
      const after = throttle.fail(nowMs());
      if (after.locked) return locked(reply, after.retryAfterSeconds);
      return reply.code(401).send({ error: 'PIN incorrecto', attemptsLeft: after.attemptsLeft });
    }
    throttle.succeed();
    openSession(reply);
    return { ok: true };
  });

  app.post('/api/parent/logout', async (req, reply) => {
    const token = readCookie(req.headers.cookie, COOKIE_NAME);
    if (token) db.deleteSession(tokenId(token));
    reply.header('set-cookie', clearedCookie());
    return reply.code(204).send();
  });

  // Todo lo de aquí dentro exige una sesión válida del padre.
  app.register(async (scope) => {
    scope.addHook('onRequest', async (req, reply) => {
      const id = sessionIdOf(req, true);
      if (id === null) {
        if (readCookie(req.headers.cookie, COOKIE_NAME)) reply.header('set-cookie', clearedCookie());
        return reply.code(401).send(NEEDS_PIN);
      }
      req.parentSessionId = id;
    });

    scope.put('/api/parent/pin', async (req, reply) => {
      const body = ChangePinBodySchema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'Datos inválidos', fields: fieldErrors(body.error) });
      const state = throttle.status(nowMs());
      if (state.locked) return locked(reply, state.retryAfterSeconds);
      if (!verifyPin(body.data.currentPin, db.getPinRecord() ?? '')) {
        const after = throttle.fail(nowMs());
        if (after.locked) return locked(reply, after.retryAfterSeconds);
        return reply.code(401).send({ error: 'PIN actual incorrecto', attemptsLeft: after.attemptsLeft });
      }
      throttle.succeed();
      db.setPinRecord(hashPin(body.data.newPin));
      db.deleteAllSessions();
      openSession(reply);
      return { ok: true };
    });
  });
}

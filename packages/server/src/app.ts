import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import {
  DEFAULT_HOST,
  DEFAULT_PORT,
  REPLAY_WINDOW_MS,
  RETENTION_DAYS,
  parseEnvelope,
  type Platform,
  type WsMessage,
} from '@agentdash/shared';
import { Pipeline } from './pipeline.js';
import { EventStore } from './store.js';

export const VERSION = '0.1.0';

export interface BuildAppOptions {
  store: EventStore | null;
  webDir?: string;
  logger?: boolean;
}

export interface BuiltApp {
  app: FastifyInstance;
  pipeline: Pipeline;
  broadcast(msg: WsMessage): void;
}

function clampLimit(raw: unknown, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 1000) : fallback;
}

export async function buildApp(opts: BuildAppOptions): Promise<BuiltApp> {
  const app = Fastify({ bodyLimit: 1_048_576, logger: opts.logger ?? false });
  const pipeline = new Pipeline(opts.store, (msg) => app.log.error(msg));
  const sockets = new Set<WebSocket>();

  const broadcast = (msg: WsMessage) => {
    const data = JSON.stringify(msg);
    for (const s of sockets) if (s.readyState === s.OPEN) s.send(data);
  };

  await app.register(fastifyWebsocket);

  app.get('/ws', { websocket: true }, (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.send(JSON.stringify({ type: 'snapshot', agents: pipeline.agents() } satisfies WsMessage));
  });

  app.post('/api/ingest', async (req, reply) => {
    let env;
    try {
      env = parseEnvelope(req.body);
    } catch (err) {
      return reply.code(400).send({ error: 'sobre inválido', detail: (err as Error).message.slice(0, 500) });
    }
    const { events, changed } = pipeline.ingest(env);
    events.forEach((event, i) => broadcast({ type: 'event', event, agents: i === events.length - 1 ? changed : [] }));
    return reply.code(202).send({ accepted: events.length });
  });

  app.get('/api/health', async () => ({
    ok: true,
    version: VERSION,
    agents: pipeline.agents().length,
    events: opts.store ? safeCount(opts.store) : 0,
  }));

  app.get('/api/agents', async () => pipeline.agents());

  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>('/api/agents/:id/events', async (req) =>
    opts.store ? opts.store.byAgent(req.params.id, clampLimit(req.query.limit, 200)) : [],
  );

  app.get<{ Querystring: { platform?: string; limit?: string } }>('/api/events/raw', async (req) => {
    const platform = req.query.platform === 'claude' || req.query.platform === 'kiro' ? (req.query.platform as Platform) : undefined;
    return opts.store ? opts.store.raw(platform, clampLimit(req.query.limit, 50)) : [];
  });

  if (opts.webDir && existsSync(join(opts.webDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: opts.webDir });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api')) return reply.sendFile('index.html');
      return reply.code(404).send({ error: 'no encontrado' });
    });
  }

  return { app, pipeline, broadcast };
}

function safeCount(store: EventStore): number {
  try {
    return store.count();
  } catch {
    return 0;
  }
}

export interface StartServerOptions {
  host?: string;
  port?: number;
  dbPath?: string;
  webDir?: string;
  retentionDays?: number;
  logger?: boolean;
}

export interface RunningServer {
  url: string;
  port: number;
  close(): Promise<void>;
}

export async function startServer(opts: StartServerOptions = {}): Promise<RunningServer> {
  const env = process.env;
  const host = opts.host ?? env.AGENTDASH_HOST ?? DEFAULT_HOST;
  const port = opts.port ?? (env.AGENTDASH_PORT ? Number(env.AGENTDASH_PORT) : DEFAULT_PORT);
  const dbPath = opts.dbPath ?? env.AGENTDASH_DB ?? join(homedir(), '.agentdash', 'agentdash.db');
  const retentionDays = opts.retentionDays ?? (env.AGENTDASH_RETENTION_DAYS ? Number(env.AGENTDASH_RETENTION_DAYS) : RETENTION_DAYS);

  let store: EventStore | null = null;
  try {
    store = new EventStore(dbPath);
  } catch (err) {
    console.error(`[agentdash] SQLite no disponible (${(err as Error).message}); se usará solo memoria`);
  }

  const { app, pipeline, broadcast } = await buildApp({ store, webDir: opts.webDir, logger: opts.logger });

  const prune = () => {
    try {
      store?.prune(Date.now() - retentionDays * 86_400_000);
    } catch (err) {
      app.log.error(err);
    }
  };
  prune();
  if (store) pipeline.replay(store.since(Date.now() - REPLAY_WINDOW_MS));

  const tickTimer = setInterval(() => {
    const changed = pipeline.tick(Date.now());
    if (changed.length) broadcast({ type: 'snapshot', agents: pipeline.agents() });
  }, 30_000);
  const pruneTimer = setInterval(prune, 3_600_000);
  tickTimer.unref();
  pruneTimer.unref();

  await app.listen({ host, port });
  const address = app.server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  const shownHost = host === '0.0.0.0' ? '127.0.0.1' : host;

  return {
    url: `http://${shownHost}:${actualPort}`,
    port: actualPort,
    async close() {
      clearInterval(tickTimer);
      clearInterval(pruneTimer);
      await app.close();
      store?.close();
    },
  };
}

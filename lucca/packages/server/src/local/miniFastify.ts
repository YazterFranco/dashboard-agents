/**
 * Un Fastify mínimo para la app de Android: ejecuta las mismas rutas (`registerApi`) dentro del teléfono o la
 * tablet, sin red ni servidor. Implementa solo lo que usan las rutas, con el mismo comportamiento que Fastify:
 * códigos, límite de cuerpo, JSON, PDF, ganchos por ámbito y errores.
 */

type Json = unknown;
type Hook = (req: LocalRequest, reply: LocalReply) => Promise<unknown> | unknown;
type Handler = (req: LocalRequest, reply: LocalReply) => Promise<unknown> | unknown;
type ErrorHandler = (error: Error & { code?: string; statusCode?: number }, req: LocalRequest, reply: LocalReply) => unknown;

interface RouteOptions {
  bodyLimit?: number;
  errorHandler?: ErrorHandler;
}

interface Route {
  method: string;
  parts: string[];
  handler: Handler;
  hooks: Hook[];
  options: RouteOptions;
  rawTypes: Set<string>;
}

/** Lo que llega: como una petición HTTP, ya separada. `body` son los bytes tal cual. */
export interface LocalRequestInit {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: Uint8Array | string | null;
}

export interface LocalResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export interface LocalRequest {
  method: string;
  url: string;
  params: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: unknown;
  ip: string;
  [key: string]: unknown;
}

const DEFAULT_BODY_LIMIT = 16 * 1024;

class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  413: 'Payload Too Large',
  415: 'Unsupported Media Type',
  500: 'Internal Server Error',
};

export class LocalReply {
  statusCode = 200;
  sent = false;
  payload: Json = undefined;
  readonly headers: Record<string, string> = {};

  code(n: number): this {
    this.statusCode = n;
    return this;
  }

  status(n: number): this {
    return this.code(n);
  }

  header(name: string, value: string): this {
    this.headers[name.toLowerCase()] = value;
    return this;
  }

  send(payload?: Json): this {
    this.payload = payload;
    this.sent = true;
    return this;
  }
}

function splitPath(path: string): string[] {
  return path.split('/').filter(Boolean);
}

class Scope {
  constructor(
    private readonly root: MiniFastify,
    private readonly hooks: Hook[],
    private readonly rawTypes: Set<string>,
  ) {}

  addHook(name: 'onRequest', hook: Hook): void {
    if (name !== 'onRequest') throw new Error(`gancho no soportado: ${name}`);
    this.hooks.push(hook);
  }

  /** El cuerpo de estos tipos llega como bytes (`Buffer`), como con `parseAs: 'buffer'`. */
  addContentTypeParser(type: string): void {
    this.rawTypes.add(type);
  }

  register(plugin: (scope: Scope) => Promise<void> | void): void {
    const child = new Scope(this.root, [...this.hooks], new Set(this.rawTypes));
    this.root.pending.push(Promise.resolve(plugin(child)));
  }

  private add(method: string, path: string, a: RouteOptions | Handler, b?: Handler): void {
    const [options, handler] = typeof a === 'function' ? [{}, a] : [a, b!];
    // Los ganchos y analizadores se leen al registrar la ruta (como en Fastify, por ámbito).
    this.root.routes.push({ method, parts: splitPath(path), handler, hooks: this.hooks, options, rawTypes: this.rawTypes });
  }

  get(path: string, a: RouteOptions | Handler, b?: Handler): void {
    this.add('GET', path, a, b);
  }
  post(path: string, a: RouteOptions | Handler, b?: Handler): void {
    this.add('POST', path, a, b);
  }
  put(path: string, a: RouteOptions | Handler, b?: Handler): void {
    this.add('PUT', path, a, b);
  }
  patch(path: string, a: RouteOptions | Handler, b?: Handler): void {
    this.add('PATCH', path, a, b);
  }
  delete(path: string, a: RouteOptions | Handler, b?: Handler): void {
    this.add('DELETE', path, a, b);
  }
}

export class MiniFastify extends Scope {
  readonly routes: Route[] = [];
  readonly pending: Promise<void>[] = [];

  constructor() {
    const hooks: Hook[] = [];
    super(undefined as unknown as MiniFastify, hooks, new Set());
    // `root` apunta a sí mismo: las rutas del ámbito raíz van a esta misma lista.
    (this as unknown as { root: MiniFastify }).root = this;
  }

  async ready(): Promise<void> {
    while (this.pending.length) await this.pending.shift();
  }

  async close(): Promise<void> {}

  private match(method: string, path: string): { route: Route; params: Record<string, string> } | 'wrong-method' | null {
    const parts = splitPath(path);
    let pathMatched = false;
    let best: { route: Route; params: Record<string, string>; rank: string } | null = null;
    for (const route of this.routes) {
      if (route.parts.length !== parts.length) continue;
      const params: Record<string, string> = {};
      const ok = route.parts.every((p, i) => {
        if (p.startsWith(':')) {
          params[p.slice(1)] = decodeURIComponent(parts[i]);
          return true;
        }
        return p === parts[i];
      });
      if (!ok) continue;
      pathMatched = true;
      if (route.method !== method) continue;
      // Como Fastify: un segmento fijo gana a un parámetro (`/review/finish` antes que `/review/:id`).
      const rank = route.parts.map((p) => (p.startsWith(':') ? '1' : '0')).join('');
      if (!best || rank < best.rank) best = { route, params, rank };
    }
    if (best) return { route: best.route, params: best.params };
    return pathMatched ? 'wrong-method' : null;
  }

  async handle(init: LocalRequestInit): Promise<LocalResponse> {
    await this.ready();
    const method = init.method.toUpperCase();
    const url = new URL(init.url, 'http://lucca.local');
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(init.headers ?? {})) headers[k.toLowerCase()] = v;
    const found = this.match(method, url.pathname);
    const reply = new LocalReply();

    if (found === null || found === 'wrong-method') {
      reply.code(404).send({ error: 'no encontrado' });
      return this.serialize(reply);
    }
    const { route, params } = found;
    const req: LocalRequest = {
      method,
      url: url.pathname + url.search,
      params,
      query: Object.fromEntries(url.searchParams),
      headers,
      body: undefined,
      ip: '127.0.0.1',
    };

    try {
      for (const hook of route.hooks) {
        await hook(req, reply);
        if (reply.sent) return this.serialize(reply);
      }
      req.body = this.parseBody(route, headers, init.body ?? null);
      const out = await route.handler(req, reply);
      if (!reply.sent) reply.send(out);
    } catch (err) {
      const error = err as Error & { code?: string; statusCode?: number };
      if (route.options.errorHandler) {
        const r = new LocalReply();
        await route.options.errorHandler(error, req, r);
        if (r.sent) return this.serialize(r);
      }
      const status = error.statusCode ?? 500;
      reply.code(status).send({ statusCode: status, code: error.code, error: STATUS_TEXT[status] ?? 'Error', message: error.message });
    }
    return this.serialize(reply);
  }

  private parseBody(route: Route, headers: Record<string, string>, raw: Uint8Array | string | null): unknown {
    if (raw === null || raw === undefined) return undefined;
    const bytes = typeof raw === 'string' ? new TextEncoder().encode(raw) : raw;
    if (bytes.length === 0) return undefined;
    const limit = route.options.bodyLimit ?? DEFAULT_BODY_LIMIT;
    if (bytes.length > limit) throw new HttpError(413, 'FST_ERR_CTP_BODY_TOO_LARGE', 'Request body is too large');
    const type = (headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    if (type === 'application/json' || type === '') {
      try {
        return JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        throw new HttpError(400, 'FST_ERR_CTP_INVALID_JSON_BODY', "Body is not valid JSON but content-type is set to 'application/json'");
      }
    }
    if (type === 'text/plain') return new TextDecoder().decode(bytes);
    if (route.rawTypes.has(type)) return Buffer.from(bytes);
    throw new HttpError(415, 'FST_ERR_CTP_INVALID_MEDIA_TYPE', `Unsupported Media Type: ${type}`);
  }

  private serialize(reply: LocalReply): LocalResponse {
    const headers = { ...reply.headers };
    let body = '';
    if (reply.payload !== undefined && reply.payload !== null) {
      if (typeof reply.payload === 'string') {
        body = reply.payload;
        headers['content-type'] ??= 'text/plain; charset=utf-8';
      } else {
        body = JSON.stringify(reply.payload);
        headers['content-type'] ??= 'application/json; charset=utf-8';
      }
    }
    return { statusCode: reply.statusCode, headers, body };
  }
}

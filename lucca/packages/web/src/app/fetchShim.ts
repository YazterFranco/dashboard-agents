/**
 * En la app, las llamadas a `/api/...` no salen a la red: las atiende el servidor interno (backend.ts). El resto de
 * la web no cambia: sigue usando `fetch` como con el servidor de casa. La cookie de papá se guarda aquí (en la
 * sesión del WebView), igual que la guardaría el navegador.
 */
import type { AppBackend } from './backend';

export interface CookieJar {
  header(): string | null;
  store(setCookie: string): void;
}

/** Tarro de una sola cookie relevante (la de papá); `Max-Age=0` la borra. Persiste en `sessionStorage` si hay. */
export function cookieJar(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null): CookieJar {
  const KEY = 'lucca.cookies';
  let cookies: Record<string, string> = {};
  try {
    cookies = JSON.parse(storage?.getItem(KEY) ?? '{}');
  } catch {
    cookies = {};
  }
  const persist = () => {
    try {
      if (Object.keys(cookies).length) storage?.setItem(KEY, JSON.stringify(cookies));
      else storage?.removeItem(KEY);
    } catch {
      /* sin almacenamiento: la sesión dura lo que la pantalla */
    }
  };
  return {
    header() {
      const pairs = Object.entries(cookies).map(([k, v]) => `${k}=${v}`);
      return pairs.length ? pairs.join('; ') : null;
    },
    store(setCookie) {
      for (const line of setCookie.split(/,(?=\s*[A-Za-z0-9_]+=)/)) {
        const [pair, ...attrs] = line.split(';').map((s) => s.trim());
        const eq = pair.indexOf('=');
        if (eq <= 0) continue;
        const name = pair.slice(0, eq);
        const value = pair.slice(eq + 1);
        const expired = attrs.some((a) => /^max-age=0$/i.test(a)) || value === '';
        if (expired) delete cookies[name];
        else cookies[name] = value;
      }
      persist();
    },
  };
}

export function localFetch(backend: AppBackend, jar: CookieJar, realFetch: typeof fetch, origin: string): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input instanceof URL ? input.toString() : input, init);
    const url = new URL(request.url, origin);
    if (url.origin !== origin || !url.pathname.startsWith('/api/')) return realFetch(input, init);

    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });
    const cookie = jar.header();
    if (cookie) headers.cookie = cookie;
    const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
    const body = hasBody ? new Uint8Array(await request.arrayBuffer()) : null;

    const res = await backend.handle({ method: request.method, url: url.pathname + url.search, headers, body });
    const out = new Headers();
    for (const [k, v] of Object.entries(res.headers)) {
      if (k === 'set-cookie') jar.store(v);
      else out.set(k, v);
    }
    const empty = res.statusCode === 204 || res.statusCode === 304 || request.method === 'HEAD';
    return new Response(empty ? null : res.body, { status: res.statusCode, headers: out });
  };
}

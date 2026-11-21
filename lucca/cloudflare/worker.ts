/**
 * Worker de Cloudflare delante del asistente de Lucca (publicado en Railway).
 *
 * 1. Cloudflare Access pide el código por correo y solo deja pasar a los correos autorizados.
 * 2. Este Worker vuelve a comprobar el token de Access (firma, aplicación, equipo y caducidad): si Access se
 *    desactivara por error, nada pasa. Sin configuración completa, responde 503 y no reenvía nada.
 * 3. Reenvía a Railway con una cabecera secreta; el servidor rechaza todo lo que no la trae.
 */
export interface Env {
  /** https://<servicio>.up.railway.app */
  ORIGIN_URL: string;
  /** El mismo valor que LUCCA_ORIGIN_SECRET en Railway (secreto de Wrangler, nunca en el código). */
  ORIGIN_SECRET: string;
  /** <equipo>.cloudflareaccess.com */
  ACCESS_TEAM_DOMAIN: string;
  /** «Application Audience (AUD) Tag» de la aplicación de Access. */
  ACCESS_AUD: string;
}

const ORIGIN_HEADER = 'x-lucca-origin';
const KEYS_TTL_MS = 60 * 60 * 1000;

let keyCache: { at: number; team: string; keys: Map<string, CryptoKey> } | null = null;

/** Para las pruebas: olvidar las claves guardadas. */
export function resetKeyCache(): void {
  keyCache = null;
}

const text = (status: number, body: string) => new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });

function b64urlBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function b64urlJson(s: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(new TextDecoder().decode(b64urlBytes(s)));
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function accessKeys(team: string): Promise<Map<string, CryptoKey>> {
  if (keyCache && keyCache.team === team && Date.now() - keyCache.at < KEYS_TTL_MS) return keyCache.keys;
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`certs ${res.status}`);
  const { keys = [] } = (await res.json()) as { keys?: Array<JsonWebKey & { kid?: string }> };
  const map = new Map<string, CryptoKey>();
  for (const jwk of keys) {
    if (!jwk.kid || jwk.kty !== 'RSA') continue;
    map.set(jwk.kid, await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']));
  }
  keyCache = { at: Date.now(), team, keys: map };
  return map;
}

/** true solo si el token es de Access, de esta aplicación, de este equipo, vigente y bien firmado. */
async function validAccessToken(token: string, env: Env): Promise<boolean> {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [h, p, s] = parts;
  const header = b64urlJson(h);
  const payload = b64urlJson(p);
  if (!header || !payload || header.alg !== 'RS256' || typeof header.kid !== 'string') return false;

  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(env.ACCESS_AUD)) return false;
  if (payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return false;
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) return false;

  let keys: Map<string, CryptoKey>;
  try {
    keys = await accessKeys(env.ACCESS_TEAM_DOMAIN);
  } catch {
    return false;
  }
  const key = keys.get(header.kid);
  if (!key) return false;
  try {
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(s), new TextEncoder().encode(`${h}.${p}`));
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!env.ORIGIN_URL || !env.ORIGIN_SECRET || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
      return text(503, 'El asistente todavía no está configurado (falta Cloudflare Access o el origen).');
    }
    const token = request.headers.get('cf-access-jwt-assertion');
    if (!token || !(await validAccessToken(token, env))) return text(403, 'Acceso no autorizado.');

    const url = new URL(request.url);
    const target = new URL(url.pathname + url.search, env.ORIGIN_URL);
    const headers = new Headers(request.headers);
    headers.set(ORIGIN_HEADER, env.ORIGIN_SECRET);
    headers.delete('host');
    const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
    try {
      return await fetch(
        new Request(target.toString(), {
          method: request.method,
          headers,
          body: hasBody ? await request.arrayBuffer() : undefined,
          redirect: 'manual',
        }),
      );
    } catch {
      return text(502, 'El asistente no responde ahora. Inténtalo otra vez en un momento.');
    }
  },
};

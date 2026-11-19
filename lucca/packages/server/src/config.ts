export interface Config {
  host: string;
  port: number;
  dbPath: string;
  tz: string;
  demo: boolean;
  webDir: string | null;
  publicUrl: string | null;
  /** Solo si hay clave de IA; el valor de la clave nunca se guarda aquí. */
  aiConfigured: boolean;
  /** Solo si están los tres datos de Mereb; los valores nunca se guardan aquí. */
  merebConfigured: boolean;
}

function parsePort(raw: string | undefined): number {
  if (!raw) return 4830;
  const port = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`LUCCA_PORT inválido: "${raw}" (debe ser un número entre 1 y 65535)`);
  }
  return port;
}

function parseTz(raw: string | undefined): string {
  const tz = raw || 'America/Panama';
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
  } catch {
    throw new Error(`TZ inválida: "${tz}" (por ejemplo America/Panama)`);
  }
  return tz;
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  return {
    host: env.LUCCA_HOST || '0.0.0.0',
    port: parsePort(env.LUCCA_PORT),
    dbPath: env.LUCCA_DB || './data/lucca.db',
    tz: parseTz(env.TZ),
    demo: env.LUCCA_DEMO === '1',
    webDir: env.LUCCA_WEB_DIR || null,
    publicUrl: env.LUCCA_PUBLIC_URL ? env.LUCCA_PUBLIC_URL.replace(/\/+$/, '') : null,
    aiConfigured: Boolean(env.ANTHROPIC_API_KEY),
    merebConfigured: Boolean(env.MEREB_URL && env.MEREB_USER && env.MEREB_PASSWORD),
  };
}

/**
 * `LUCCA_FAKE_NOW`: fija el "ahora" del servidor (instante ISO). Solo para pruebas: así las capturas y los
 * escenarios de borde (domingo, medianoche en UTC) se repiten igual cualquier día. Si está mal escrita, falla.
 */
export function parseFakeNow(value: string | undefined): Date | null {
  if (!value) return null;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) {
    throw new Error(`LUCCA_FAKE_NOW inválida: "${value}" (usa un instante ISO, por ejemplo 2026-11-18T17:00:00Z)`);
  }
  return at;
}

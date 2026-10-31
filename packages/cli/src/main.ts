import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { DEFAULT_HOST, DEFAULT_PORT, type AgentEvent } from '@agentdash/shared';
import { startServer, VERSION } from '@agentdash/server';
import { INSTALL_TARGETS, install, uninstall, type InstallTarget } from './install/index.js';
import { runDemo } from './demo.js';

// node:sqlite is stable enough for us; hide its ExperimentalWarning from users.
const emitWarning = process.emitWarning.bind(process);
process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
  const text = typeof warning === 'string' ? warning : warning?.message;
  if (/SQLite/i.test(text ?? '')) return;
  return (emitWarning as (...a: unknown[]) => void)(warning, ...rest);
}) as typeof process.emitWarning;

const HERE = fileURLToPath(new URL('.', import.meta.url));
const HOOK_SOURCE = join(HERE, 'hook.mjs');
const WEB_DIR = join(HERE, 'web');
const defaultUrl = () => process.env.AGENTDASH_URL ?? `http://${DEFAULT_HOST}:${process.env.AGENTDASH_PORT ?? DEFAULT_PORT}`;

const HELP = `AgentDash ${VERSION} — dashboard en vivo de agentes (Claude Code, Kiro)

Uso:
  agentdash start [--port 4820] [--host 127.0.0.1] [--db ruta]
  agentdash install <claude|kiro-cli|kiro-ide> [--agent nombre] [--workspace carpeta] [--print]
  agentdash uninstall <claude|kiro-cli|kiro-ide> [--agent nombre] [--workspace carpeta]
  agentdash demo [--url http://127.0.0.1:4820] [--speed 1]
  agentdash export-fixtures [--url ...] [--out fixtures] [--platform claude|kiro] [--limit 50]
`;

function fail(msg: string): never {
  process.stderr.write(`agentdash: ${msg}\n`);
  process.exit(1);
}

function target(value: string | undefined): InstallTarget {
  if (!value || !INSTALL_TARGETS.includes(value as InstallTarget)) fail(`indica un destino: ${INSTALL_TARGETS.join(' | ')}`);
  return value as InstallTarget;
}

async function cmdStart(values: Record<string, unknown>) {
  const server = await startServer({
    host: values.host as string | undefined,
    port: values.port ? Number(values.port) : undefined,
    dbPath: values.db as string | undefined,
    webDir: existsSync(WEB_DIR) ? WEB_DIR : undefined,
  });
  process.stdout.write(`AgentDash escuchando en ${server.url}\n`);
  if (!existsSync(WEB_DIR)) process.stdout.write('(UI no compilada: ejecuta "npm run build" para servirla)\n');
  const stop = async () => {
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

async function cmdInstall(kind: 'install' | 'uninstall', positionals: string[], values: Record<string, unknown>) {
  const t = target(positionals[1]);
  const opts = {
    home: homedir(),
    hookSource: HOOK_SOURCE,
    agent: values.agent as string | undefined,
    workspace: (values.workspace as string | undefined) ?? (t === 'kiro-ide' ? process.cwd() : undefined),
    print: Boolean(values.print),
  };
  const result = kind === 'install' ? await install(t, opts) : await uninstall(t, opts);
  if (result.printed) process.stdout.write(result.printed + '\n');
  process.stdout.write(result.message + '\n');
}

async function cmdDemo(values: Record<string, unknown>) {
  const url = (values.url as string | undefined) ?? defaultUrl();
  const speed = values.speed ? Number(values.speed) : 1;
  process.stdout.write(`Enviando la demo a ${url} (velocidad ×${speed})…\n`);
  const sent = await runDemo(url, speed, (n, total) => {
    if (process.stdout.isTTY) process.stdout.write(`\r  ${n}/${total} eventos`);
  });
  process.stdout.write(`\nListo: ${sent} eventos enviados. Abre ${url}\n`);
}

function envelopeFrom(ev: AgentEvent) {
  const platform = ev.platform === 'claude' ? 'claude' : ev.surface === 'ide' ? 'kiro-ide' : 'kiro-cli';
  let payload: unknown = null;
  let payloadText: string | undefined;
  try {
    payload = JSON.parse(ev.raw ?? 'null');
  } catch {
    payloadText = ev.raw;
  }
  return { v: 1, platform, receivedAt: ev.ts, cwd: ev.cwd, payload, ...(payloadText ? { payloadText } : {}) };
}

async function cmdExport(values: Record<string, unknown>) {
  const url = ((values.url as string | undefined) ?? defaultUrl()).replace(/\/+$/, '');
  const out = (values.out as string | undefined) ?? 'fixtures';
  const params = new URLSearchParams({ limit: String(values.limit ?? 50) });
  if (values.platform) params.set('platform', String(values.platform));
  const res = await fetch(`${url}/api/events/raw?${params}`).catch(() => fail(`no pude conectar con ${url}`));
  const events = (await res.json()) as AgentEvent[];
  events.forEach((ev, i) => {
    const env = envelopeFrom(ev);
    const dir = join(out, env.platform);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${String(i).padStart(3, '0')}-${ev.type.replace('.', '-')}.json`), JSON.stringify(env, null, 2) + '\n');
  });
  process.stdout.write(`Exportados ${events.length} eventos a ${out}/ (revisa que no contengan datos privados antes de compartirlos)\n`);
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      port: { type: 'string' },
      host: { type: 'string' },
      db: { type: 'string' },
      agent: { type: 'string' },
      workspace: { type: 'string' },
      print: { type: 'boolean' },
      url: { type: 'string' },
      speed: { type: 'string' },
      out: { type: 'string' },
      platform: { type: 'string' },
      limit: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });
  if (values.version) return void process.stdout.write(`${VERSION}\n`);
  switch (positionals[0]) {
    case 'start':
      return cmdStart(values);
    case 'install':
    case 'uninstall':
      return cmdInstall(positionals[0], positionals, values);
    case 'demo':
      return cmdDemo(values);
    case 'export-fixtures':
      return cmdExport(values);
    default:
      process.stdout.write(HELP);
      if (positionals[0] && !values.help) process.exitCode = 1;
  }
}

main().catch((err) => fail((err as Error).message));

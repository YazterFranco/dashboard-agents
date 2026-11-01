import { spawnSync } from 'node:child_process';

export type Engine = 'docker' | 'podman';
export const ENGINES: Engine[] = ['docker', 'podman'];

const NAME: Record<Engine, string> = { docker: 'Docker', podman: 'Podman' };
const CONTAINER = 'agentdash';
const IMAGE = 'agentdash:local';
const PORT = '127.0.0.1:4820:4820';
const PODMAN_VOLUME = 'agentdash-data:/data';

export type EngineChoice = { engine: Engine; note?: string } | { error: string };

/**
 * Picks the container engine: the one requested, else the one already running AgentDash,
 * else the only one available, else Docker (telling how to switch).
 */
export function chooseEngine(opts: { requested?: string; available: Engine[]; running: Engine[] }): EngineChoice {
  const { requested, available, running } = opts;
  if (requested !== undefined) {
    if (!ENGINES.includes(requested as Engine)) return { error: `Motor desconocido "${requested}": usa docker o podman.` };
    const engine = requested as Engine;
    if (!available.includes(engine)) {
      return { error: `${NAME[engine]} no está disponible: instálalo o arráncalo${engine === 'docker' ? ' (Docker Desktop o el servicio docker)' : ' (en macOS/Windows: podman machine start)'}.` };
    }
    return { engine };
  }
  const alreadyRunning = running.find((e) => available.includes(e));
  if (alreadyRunning) return { engine: alreadyRunning };
  if (available.length === 1) return { engine: available[0] };
  if (available.length === 0) {
    return { error: 'No encontré Docker o Podman en marcha. Arranca uno de los dos, o usa "npm run agentdash -- start" sin contenedor.' };
  }
  return { engine: 'docker', note: 'Usando Docker. También tienes Podman: añade --engine podman para usarlo.' };
}

/** AgentDash publishes port 4820 on both engines, so only one of them can run it at a time. */
export function conflictWith(engine: Engine, running: Engine[]): string | undefined {
  const other = running.find((e) => e !== engine);
  if (!other) return undefined;
  return `AgentDash ya está corriendo con ${NAME[other]} en el puerto 4820. Detenlo primero con "npm run agentdash -- container down --engine ${other}" o sigue usando ${NAME[other]}.`;
}

export function planUp(engine: Engine): string[][] {
  if (engine === 'docker') return [['docker', 'compose', 'up', '-d', '--build']];
  return [
    // Docker format keeps the image's HEALTHCHECK (the OCI format drops it).
    ['podman', 'build', '--format', 'docker', '-t', IMAGE, '.'],
    ['podman', 'run', '-d', '--replace', '--name', CONTAINER, '-p', PORT, '-v', PODMAN_VOLUME, '--restart', 'unless-stopped', IMAGE],
  ];
}

export function planDown(engine: Engine): string[][] {
  return engine === 'docker' ? [['docker', 'compose', 'down']] : [['podman', 'rm', '-f', CONTAINER]];
}

export function planLogs(engine: Engine): string[][] {
  return engine === 'docker' ? [['docker', 'compose', 'logs', '-f', CONTAINER]] : [['podman', 'logs', '-f', CONTAINER]];
}

/* ---------- side effects (exercised by hand, not unit tests) ---------- */

export function availableEngines(): Engine[] {
  return ENGINES.filter((e) => spawnSync(e, ['info'], { stdio: 'ignore', timeout: 15_000 }).status === 0);
}

export function enginesRunningAgentDash(available: Engine[]): Engine[] {
  return available.filter((e) => {
    const r = spawnSync(e, ['ps', '--filter', `name=^${CONTAINER}$`, '--format', '{{.Names}}'], { encoding: 'utf8', timeout: 15_000 });
    return r.status === 0 && r.stdout.split('\n').some((line) => line.trim() === CONTAINER);
  });
}

/** Runs each command in order, streaming its output. Returns the first non-zero exit code, or 0. */
export function runPlan(plan: string[][], cwd: string): number {
  for (const [cmd, ...args] of plan) {
    process.stdout.write(`$ ${cmd} ${args.join(' ')}\n`);
    const r = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
    if (r.status !== 0) return r.status ?? 1;
  }
  return 0;
}

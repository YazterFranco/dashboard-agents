import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { hookCommand, installHookFile, isOurCommand } from '../paths.js';
import { addClaudeHooks, removeClaudeHooks } from './claude.js';
import { addKiroCliHooks, removeKiroCliHooks } from './kiro-cli.js';
import { kiroIdeHookFiles } from './kiro-ide.js';
import { readJsonObject, writeJsonWithBackup } from './json.js';

export type InstallTarget = 'claude' | 'kiro-cli' | 'kiro-ide';
export const INSTALL_TARGETS: InstallTarget[] = ['claude', 'kiro-cli', 'kiro-ide'];

export interface InstallOptions {
  home: string;
  hookSource: string;
  agent?: string;
  workspace?: string;
  print?: boolean;
}

export interface InstallResult {
  written: string[];
  printed?: string;
  message: string;
}

const claudeSettings = (home: string) => join(home, '.claude', 'settings.json');

function kiroAgentFile(home: string, agent: string | undefined): string {
  const dir = join(home, '.kiro', 'agents');
  const names = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort() : [];
  if (agent) {
    if (!names.includes(agent)) {
      throw new Error(`No existe el agente de Kiro "${agent}" en ${dir}. Disponibles: ${names.join(', ') || '(ninguno)'}.`);
    }
    return join(dir, `${agent}.json`);
  }
  if (names.length === 1) return join(dir, `${names[0]}.json`);
  if (names.length === 0) {
    throw new Error(`No hay agentes en ${dir}. Crea uno con Kiro CLI o usa --print para copiar los hooks a mano.`);
  }
  throw new Error(`Hay varios agentes de Kiro (${names.join(', ')}). Elige uno con --agent <nombre>.`);
}

function requireWorkspace(workspace: string | undefined): string {
  if (!workspace) throw new Error('Kiro IDE usa hooks por proyecto: indica la carpeta con --workspace <ruta>.');
  return workspace;
}

export async function install(target: InstallTarget, opts: InstallOptions): Promise<InstallResult> {
  const { home } = opts;
  switch (target) {
    case 'claude': {
      const cmd = hookCommand(home, 'claude');
      if (opts.print) {
        return { written: [], printed: JSON.stringify(addClaudeHooks({}, cmd), null, 2), message: `Añade este bloque "hooks" a ${claudeSettings(home)}` };
      }
      const path = claudeSettings(home);
      const next = addClaudeHooks(readJsonObject(path), cmd);
      const hook = installHookFile(home, opts.hookSource);
      writeJsonWithBackup(path, next);
      return { written: [hook, path], message: `Hooks de Claude Code instalados en ${path}. Abre una sesión nueva de Claude para verlos en el dashboard.` };
    }
    case 'kiro-cli': {
      const cmd = hookCommand(home, 'kiro-cli');
      if (opts.print) {
        return { written: [], printed: JSON.stringify(addKiroCliHooks({}, cmd), null, 2), message: 'Añade este bloque "hooks" al JSON de tu agente en ~/.kiro/agents/' };
      }
      const path = kiroAgentFile(home, opts.agent);
      const next = addKiroCliHooks(readJsonObject(path), cmd);
      const hook = installHookFile(home, opts.hookSource);
      writeJsonWithBackup(path, next);
      return { written: [hook, path], message: `Hooks de Kiro CLI instalados en ${path}. Inicia una sesión nueva con ese agente.` };
    }
    case 'kiro-ide': {
      const files = kiroIdeHookFiles(home);
      if (opts.print) {
        return { written: [], printed: JSON.stringify(files, null, 2), message: 'Guarda cada objeto como un archivo en <proyecto>/.kiro/hooks/' };
      }
      const dir = join(requireWorkspace(opts.workspace), '.kiro', 'hooks');
      const written = [installHookFile(home, opts.hookSource)];
      for (const [file, data] of Object.entries(files)) {
        const path = join(dir, file);
        writeJsonWithBackup(path, data);
        written.push(path);
      }
      return { written, message: `Hooks de Kiro IDE instalados en ${dir}. Recarga la ventana de Kiro si no aparecen.` };
    }
  }
}

export async function uninstall(target: InstallTarget, opts: InstallOptions): Promise<InstallResult> {
  const { home } = opts;
  switch (target) {
    case 'claude': {
      const path = claudeSettings(home);
      if (!existsSync(path)) return { written: [], message: 'No había hooks de Claude instalados.' };
      writeJsonWithBackup(path, removeClaudeHooks(readJsonObject(path)));
      return { written: [path], message: `Hooks de AgentDash eliminados de ${path}.` };
    }
    case 'kiro-cli': {
      const path = kiroAgentFile(home, opts.agent);
      writeJsonWithBackup(path, removeKiroCliHooks(readJsonObject(path)));
      return { written: [path], message: `Hooks de AgentDash eliminados de ${path}.` };
    }
    case 'kiro-ide': {
      const dir = join(requireWorkspace(opts.workspace), '.kiro', 'hooks');
      const removed: string[] = [];
      for (const file of Object.keys(kiroIdeHookFiles(home))) {
        const path = join(dir, file);
        if (existsSync(path) && isOurCommand(readFileSync(path, 'utf8'))) {
          rmSync(path);
          rmSync(`${path}.bak`, { force: true });
          removed.push(path);
        }
      }
      return { written: removed, message: `Eliminados ${removed.length} hooks de AgentDash de ${dir}.` };
    }
  }
}

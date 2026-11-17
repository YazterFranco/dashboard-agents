import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

/**
 * Carga un archivo `.env` en `env` (por defecto `process.env`). Lo que ya está definido en el entorno manda:
 * el `.env` solo rellena lo que falta. Devuelve false si el archivo no existe.
 */
export function loadDotEnv(path: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!existsSync(path)) return false;
  for (const [key, value] of Object.entries(parseEnv(readFileSync(path, 'utf8')))) {
    if (env[key] === undefined) env[key] = value;
  }
  return true;
}

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type Json = Record<string, unknown>;

export function isObject(x: unknown): x is Json {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

/** Reads a JSON object file; a missing file is `{}`. Invalid JSON throws and the file is left untouched. */
export function readJsonObject(path: string): Json {
  if (!existsSync(path)) return {};
  const text = readFileSync(path, 'utf8');
  if (!text.trim()) return {};
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`${path} no es JSON válido; no lo modifico. Corrígelo o usa --print para pegar los hooks a mano. (${(err as Error).message})`);
  }
  if (!isObject(data)) throw new Error(`${path} no contiene un objeto JSON; no lo modifico.`);
  return data;
}

/** Writes JSON with 2-space indent, keeping a .bak of the previous version. */
export function writeJsonWithBackup(path: string, data: unknown): void {
  if (existsSync(path)) copyFileSync(path, `${path}.bak`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

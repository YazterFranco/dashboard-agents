import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const dist = here('./dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

await build({
  entryPoints: [here('./src/index.ts')],
  outfile: here('./dist/lucca.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  alias: { '@lucca/shared': here('../shared/src/index.ts') },
  banner: {
    js: "import { createRequire as __luccaCreateRequire } from 'node:module';\nconst require = __luccaCreateRequire(import.meta.url);",
  },
  logLevel: 'warning',
});

const web = here('../web/dist');
if (existsSync(web)) cpSync(web, here('./dist/web'), { recursive: true });
else console.warn('[build] packages/web/dist no existe: la web no se incluirá (construye @lucca/web primero)');
console.log('[build] dist/lucca.mjs listo');

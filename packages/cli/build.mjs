import { build } from 'esbuild';
import { chmodSync, cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const dist = here('./dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

await build({
  entryPoints: [here('./src/main.ts')],
  outfile: here('./dist/agentdash.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  alias: { '@agentdash/shared': here('../shared/src/index.ts'), '@agentdash/server': here('../server/src/index.ts') },
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire as __agentdashCreateRequire } from 'node:module';\nconst require = __agentdashCreateRequire(import.meta.url);",
  },
  logLevel: 'warning',
});

chmodSync(here('./dist/agentdash.mjs'), 0o755);
cpSync(here('./hook/hook.mjs'), here('./dist/hook.mjs'));
const web = here('../web/dist');
if (existsSync(web)) cpSync(web, here('./dist/web'), { recursive: true });
else console.warn('[build] packages/web/dist no existe: la UI no se incluirá (ejecuta el build de web primero)');
console.log('[build] dist/agentdash.mjs listo');

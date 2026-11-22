import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const shared = fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url));

export default defineConfig({
  resolve: {
    alias: { '@lucca/shared': shared },
  },
  test: {
    testTimeout: 15000,
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          include: ['packages/*/test/**/*.test.ts', 'packages/web/src/**/*.test.{ts,tsx}', 'cloudflare/**/*.test.ts'],
        },
      },
      {
        // Las mismas pruebas de la API, contra el motor de la app de Android: MiniFastify + sql.js.
        extends: true,
        resolve: {
          alias: [{ find: /^\.\.\/src\/app\.js$/, replacement: fileURLToPath(new URL('./packages/server/src/local/testApp.ts', import.meta.url)) }],
        },
        test: {
          name: 'app',
          include: ['packages/server/test/**/*.test.ts'],
          // Solo tienen sentido con un servidor de verdad: red de casa, cabecera de Cloudflare, variables de entorno.
          exclude: ['packages/server/test/{origin,privateNet,config,env}.test.ts'],
          setupFiles: ['packages/server/test/appMode.setup.ts'],
        },
      },
    ],
  },
});

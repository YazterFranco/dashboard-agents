import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Dos compilaciones de la misma web:
 * - normal (`vite build`): la sirve el servidor de casa (o Railway) y habla con él por /api.
 * - app (`vite build --mode app`): la empaqueta la app de Android; lleva dentro el servidor (sql.js, pdf.js,
 *   las mismas rutas) y funciona sin computadora. Los módulos de Node se cambian por equivalentes del navegador.
 */
export default defineConfig(({ mode }) => {
  const app = mode === 'app';
  return {
    plugins: [react()],
    define: { 'import.meta.env.VITE_LUCCA_APP': JSON.stringify(app ? '1' : '0') },
    resolve: {
      alias: [
        { find: '@lucca/shared', replacement: here('../shared/src/index.ts') },
        ...(app
          ? [
              { find: /^\.\/polyfills$/, replacement: here('src/app/polyfills.ts') },
              { find: /^node:crypto$/, replacement: here('src/app/shims/nodeCrypto.ts') },
              { find: /^node:fs$/, replacement: here('src/app/shims/nodeFs.ts') },
              { find: /^node:path$/, replacement: here('src/app/shims/nodePath.ts') },
              { find: /^node:module$/, replacement: here('src/app/shims/nodeModule.ts') },
            ]
          : []),
      ],
    },
    server: {
      host: true,
      proxy: { '/api': 'http://127.0.0.1:4830' },
    },
    build: {
      outDir: app ? 'dist-app' : 'dist',
      emptyOutDir: true,
      // La app también debe abrir en tablets con el WebView sin actualizar (desde Chrome 80): la sintaxis nueva
      // (??=, campos privados…) se convierte. La web de casa se queda en código moderno.
      target: app ? ['es2020', 'chrome80'] : 'es2022',
      chunkSizeWarningLimit: 4000,
    },
  };
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@lucca/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)) },
  },
  server: {
    host: true,
    proxy: { '/api': 'http://127.0.0.1:4830' },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});

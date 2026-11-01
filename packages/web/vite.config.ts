import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const shared = (p: string) => fileURLToPath(new URL(`../shared/src/${p}`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@agentdash/shared/constants': shared('constants.ts'),
      '@agentdash/shared': shared('index.ts'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:4820',
      '/ws': { target: 'ws://127.0.0.1:4820', ws: true },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});

import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@agentdash/shared/constants': fileURLToPath(new URL('./packages/shared/src/constants.ts', import.meta.url)),
      '@agentdash/shared': fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'packages/web/src/**/*.test.ts'],
    testTimeout: 15000,
  },
});

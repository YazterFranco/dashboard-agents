import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localDate } from '@lucca/shared';
import { buildApp } from './app.js';
import { loadConfig, parseFakeNow, type Config } from './config.js';
import { LuccaDb } from './db.js';
import { loadDotEnv } from './env.js';
import { seedDemo } from './seed.js';

async function main(): Promise<void> {
  // El `.env` de la carpeta desde la que se arranca; lo que ya esté en el entorno manda.
  loadDotEnv(join(process.cwd(), '.env'));

  let config: Config;
  let fakeNow: Date | null;
  try {
    config = loadConfig(process.env);
    fakeNow = parseFakeNow(process.env.LUCCA_FAKE_NOW);
  } catch (err) {
    console.error(`[lucca] ${(err as Error).message}`);
    process.exit(1);
  }

  // En el paquete construido la web va junto al servidor (dist/web); en desarrollo la sirve Vite.
  const bundledWeb = join(dirname(fileURLToPath(import.meta.url)), 'web');
  if (!config.webDir && existsSync(bundledWeb)) config = { ...config, webDir: bundledWeb };

  const db = new LuccaDb(config.dbPath);
  const now = fakeNow ? () => fakeNow : () => new Date();
  if (config.demo) seedDemo(db, localDate(now(), config.tz));

  const app = await buildApp({ db, config, now, logger: true });
  await app.listen({ host: config.host, port: config.port });

  const shutdown = async () => {
    await app.close();
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[lucca] no se pudo arrancar:', err);
  process.exit(1);
});

// Borra el PIN del área de papá (y cierra todas las sesiones) para poder crear uno nuevo en /papa.
// Úsalo con el asistente apagado:  npm run reset-pin
const { existsSync } = require('node:fs');

try {
  process.loadEnvFile('.env'); // por si LUCCA_DB está en el .env
} catch {
  /* sin .env: se usa lo que haya en el entorno */
}

const path = process.env.LUCCA_DB || './data/lucca.db';
if (path !== ':memory:' && !existsSync(path)) {
  console.error(`No encuentro la base de datos en ${path}. Si está en otra carpeta, indícala: LUCCA_DB=/ruta/lucca.db npm run reset-pin`);
  process.exit(1);
}

const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(path);
try {
  const removed = db.prepare("DELETE FROM settings WHERE key = 'pin'").run().changes;
  db.prepare('DELETE FROM parent_sessions').run();
  console.log(removed ? 'PIN borrado. Enciende el asistente y abre /papa enseguida para crear uno nuevo.' : 'No había ningún PIN guardado: abre /papa para configurarlo.');
} catch (err) {
  console.error(`No se pudo borrar el PIN: ${err.message}`);
  process.exitCode = 1;
} finally {
  db.close();
}

/**
 * Arranque de la app de Android: prepara el servidor interno antes de pintar la primera pantalla.
 * Solo se incluye en la compilación de la app (`vite build --mode app`).
 */
import { Buffer } from 'buffer';
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { startBackend } from './backend';
import { cookieJar, localFetch } from './fetchShim';
import { indexedDbStore } from './storage';

export async function bootApp(): Promise<void> {
  // El código del servidor usa Buffer (cuerpo del PDF, claves): en el WebView no existe.
  (globalThis as { Buffer?: unknown }).Buffer ??= Buffer;
  const sql = await initSqlJs({ locateFile: () => wasmUrl });
  const backend = await startBackend({ store: indexedDbStore(), sql });
  let session: Storage | null = null;
  try {
    session = window.sessionStorage;
  } catch {
    session = null;
  }
  window.fetch = localFetch(backend, cookieJar(session), window.fetch.bind(window), window.location.origin);
  // Al pasar a segundo plano (cambiar de app, apagar la pantalla) se guarda lo pendiente enseguida.
  const flush = () => void backend.flush().catch(() => {});
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
}

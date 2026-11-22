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
import { watchSharedPdf } from './sharedPdf';
import { setNativeVoice } from '../nativeVoice';
import { dispatchBack, isParentPath, navigate } from '../nav';

/** Botón «atrás» de Android: primero la pantalla abierta; luego a la de Lucca; en ella, la app pasa a segundo plano. */
async function handleBackButton(): Promise<void> {
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) return;
  const { App } = await import('@capacitor/app');
  await App.addListener('backButton', () => {
    if (dispatchBack()) return;
    if (isParentPath(window.location.pathname)) navigate('/');
    else void App.minimizeApp();
  });
}

/** En el teléfono: el motor de voz del sistema y los idiomas que tiene instalados. */
async function prepareVoice(): Promise<void> {
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) return;
  const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
  let languages: string[] = [];
  try {
    languages = (await TextToSpeech.getSupportedLanguages()).languages;
  } catch {
    languages = [];
  }
  setNativeVoice(TextToSpeech, languages);
}

/**
 * SQLite en WebAssembly; si el WebView es antiguo (antes de Chrome 85 no admite BigInt en WebAssembly), la versión
 * en JavaScript puro de sql.js: más lenta, pero los mismos datos y las mismas consultas. Solo se descarga si hace falta.
 */
async function loadSql() {
  try {
    const sql = await initSqlJs({ locateFile: () => wasmUrl });
    // En un WebView antiguo la carga «funciona» y el fallo llega al crear la primera base: se comprueba aquí.
    new sql.Database().close();
    return sql;
  } catch {
    const { default: initAsm } = await import('sql.js/dist/sql-asm.js');
    return await initAsm();
  }
}

export async function bootApp(): Promise<void> {
  // El código del servidor usa Buffer (cuerpo del PDF, claves): en el WebView no existe.
  (globalThis as { Buffer?: unknown }).Buffer ??= Buffer;
  const sql = await loadSql();
  await prepareVoice().catch(() => {});
  const store = indexedDbStore();
  const backend = await startBackend({ store, sql });
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
  void handleBackButton().catch(() => {});
  // PDF de la agenda compartido desde otra app (Descargas, Chrome…): no debe impedir que la app abra.
  void watchSharedPdf(store).catch(() => {});
}

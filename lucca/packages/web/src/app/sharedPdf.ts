/**
 * «Abrir con / Compartir → Lucca» en Android. El plugin nativo (SharedPdfPlugin.java) entrega el PDF; aquí se guarda
 * en el dispositivo y se lleva a papá a su área, donde, tras el PIN, se abre la revisión de la agenda.
 */
import { navigate } from '../nav';
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { KeyValueStore } from './storage';

interface SharedPdfPlugin {
  takePendingPdf(): Promise<{ name?: string; base64?: string; error?: 'too-large' | 'unreadable' }>;
  addListener(event: 'pdf', listener: () => void): Promise<{ remove(): Promise<void> }>;
}

export const SHARED_KEY = 'shared-pdf';
export const SHARED_NAME_KEY = 'shared-pdf-name';
export const SHARED_ERROR_KEY = 'shared-pdf-error';
/** Aviso a la pantalla abierta: llegó un PDF compartido. */
export const SHARED_EVENT = 'lucca:shared-pdf';

const base64ToBytes = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Lo que entrega el plugin, guardado en el dispositivo. Devuelve true si había algo. */
export async function stashShared(
  result: { name?: string; base64?: string; error?: string },
  store: KeyValueStore,
): Promise<boolean> {
  if (result.error) {
    await store.set(SHARED_ERROR_KEY, result.error);
    return true;
  }
  if (!result.base64) return false;
  await store.set(SHARED_KEY, base64ToBytes(result.base64));
  await store.set(SHARED_NAME_KEY, result.name || 'agenda.pdf');
  return true;
}

export type SharedPdf = { file: File } | { error: string } | null;

const MESSAGES: Record<string, string> = {
  'too-large': 'El PDF pesa más de 5 MB',
  unreadable: 'No pude abrir el PDF que compartiste. Descárgalo otra vez desde Mereb e inténtalo.',
};

/** El PDF compartido pendiente (se borra al tomarlo), o el problema que hubo, o nada. */
export async function takeShared(store: KeyValueStore): Promise<SharedPdf> {
  const error = await store.get(SHARED_ERROR_KEY);
  if (typeof error === 'string') {
    await store.delete(SHARED_ERROR_KEY);
    return { error: MESSAGES[error] ?? MESSAGES.unreadable };
  }
  const bytes = await store.get(SHARED_KEY);
  if (!(bytes instanceof Uint8Array)) return null;
  const name = await store.get(SHARED_NAME_KEY);
  await store.delete(SHARED_KEY);
  await store.delete(SHARED_NAME_KEY);
  return { file: new File([bytes as BlobPart], typeof name === 'string' ? name : 'agenda.pdf', { type: 'application/pdf' }) };
}

/** Al arrancar y mientras la app está abierta: atiende los PDF que llegan de otras apps. */
export async function watchSharedPdf(store: KeyValueStore): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const plugin = registerPlugin<SharedPdfPlugin>('SharedPdf');
  const check = async () => {
    const got = await stashShared(await plugin.takePendingPdf(), store);
    if (!got) return;
    if (/^\/papa(\/|$)/.test(window.location.pathname)) window.dispatchEvent(new Event(SHARED_EVENT));
    else navigate('/papa');
  };
  await plugin.addListener('pdf', () => void check());
  await check();
}

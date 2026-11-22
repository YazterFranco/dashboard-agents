/**
 * Lo que la app guarda en el dispositivo: la base de datos (bytes de SQLite) y la configuración de la app
 * (clave de IA, dirección de Mereb). En Android vive en el almacenamiento privado de la app: nadie más lo lee
 * y se borra al desinstalarla.
 */
export interface KeyValueStore {
  get(key: string): Promise<Uint8Array | string | null>;
  set(key: string, value: Uint8Array | string): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Para pruebas: todo en memoria. */
export function memoryStore(initial: Record<string, Uint8Array | string> = {}): KeyValueStore & { data: Map<string, Uint8Array | string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    async get(key) {
      return data.get(key) ?? null;
    },
    async set(key, value) {
      data.set(key, value);
    },
    async delete(key) {
      data.delete(key);
    },
  };
}

const DB_NAME = 'lucca-app';
const STORE = 'kv';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** IndexedDB del WebView. Se pide almacenamiento persistente para que el sistema no lo borre si falta espacio. */
export function indexedDbStore(): KeyValueStore {
  let opened: Promise<IDBDatabase> | null = null;
  const db = () =>
    (opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  void navigator.storage?.persist?.().catch(() => false);
  const tx = async (mode: IDBTransactionMode) => (await db()).transaction(STORE, mode).objectStore(STORE);
  return {
    async get(key) {
      const value = await request((await tx('readonly')).get(key));
      return value === undefined ? null : (value as Uint8Array | string);
    },
    async set(key, value) {
      await request((await tx('readwrite')).put(value, key));
    },
    async delete(key) {
      await request((await tx('readwrite')).delete(key));
    },
  };
}

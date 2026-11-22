/**
 * La app de Android corre en el WebView del sistema, que en algunas tablets no se actualiza (por ejemplo Chrome 83).
 * La sintaxis moderna se convierte al compilar (vite.config.ts → target chrome80); aquí se añaden las funciones
 * modernas que faltan (Array.at, Object.hasOwn, replaceAll, structuredClone…). Va antes que todo lo demás.
 */
import 'core-js/actual';

// crypto.randomUUID llegó en Chrome 92: con getRandomValues se hace igual (UUID v4).
if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function') {
  Object.defineProperty(crypto, 'randomUUID', {
    configurable: true,
    value: function randomUUID(): string {
      const b = crypto.getRandomValues(new Uint8Array(16));
      b[6] = (b[6] & 0x0f) | 0x40;
      b[8] = (b[8] & 0x3f) | 0x80;
      const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    },
  });
}

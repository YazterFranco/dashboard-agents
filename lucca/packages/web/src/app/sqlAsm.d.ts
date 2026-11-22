// sql.js en JavaScript puro (sin WebAssembly), para WebViews antiguos: la misma interfaz que sql-wasm.
declare module 'sql.js/dist/sql-asm.js' {
  import type initSqlJs from 'sql.js';
  const init: typeof initSqlJs;
  export default init;
}

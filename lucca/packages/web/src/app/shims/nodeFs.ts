// En la app no hay sistema de archivos: la base de datos vive en IndexedDB (ver app/storage.ts).
export const existsSync = (): boolean => false;
export const mkdirSync = (): void => {};
export const readFileSync = (): never => {
  throw new Error('sin archivos en la app');
};

// `createRequire` solo se usa para abrir node:sqlite, que en la app no existe (allí se usa sql.js).
export const createRequire = (): never => {
  throw new Error('node:sqlite no está en la app');
};

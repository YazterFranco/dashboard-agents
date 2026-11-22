/**
 * Lo mínimo que `LuccaDb` necesita de SQLite. En la computadora lo da `node:sqlite`; en la app de Android,
 * sql.js (el mismo SQLite compilado a WebAssembly), con las mismas tablas y consultas.
 */
export type SqlValue = string | number | null;
export type SqlRow = Record<string, unknown>;

export interface SqlStatement {
  run(...params: SqlValue[]): { changes: number | bigint };
  get(...params: SqlValue[]): SqlRow | undefined;
  all(...params: SqlValue[]): SqlRow[];
}

export interface SqlHandle {
  exec(sql: string): void;
  prepare(sql: string): SqlStatement;
  close(): void;
}

/** La parte de sql.js que se usa (para no depender de sus tipos aquí). */
export interface SqlJsDatabaseLike {
  run(sql: string, params?: SqlValue[]): unknown;
  exec(sql: string): unknown;
  prepare(sql: string): {
    bind(params: SqlValue[]): boolean;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): boolean;
  };
  getRowsModified(): number;
  close(): void;
}

const READ_ONLY = /^\s*(SELECT|PRAGMA\s+user_version\s*$)/i;

/**
 * SqlHandle sobre sql.js. `onWrite` avisa de cada cambio (para guardar la base en el dispositivo).
 * sql.js no acepta `undefined` como parámetro: se pasa como NULL, igual que hace node:sqlite con los opcionales.
 */
export function sqlJsHandle(db: SqlJsDatabaseLike, onWrite: () => void = () => {}): SqlHandle {
  const clean = (params: SqlValue[]): SqlValue[] => params.map((p) => (p === undefined ? null : p));
  const query = (sql: string, params: SqlValue[]): SqlRow[] => {
    const stmt = db.prepare(sql);
    try {
      if (params.length) stmt.bind(clean(params));
      const rows: SqlRow[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  };
  return {
    exec(sql) {
      db.exec(sql);
      if (!READ_ONLY.test(sql)) onWrite();
    },
    prepare(sql) {
      return {
        run(...params) {
          db.run(sql, clean(params));
          const changes = db.getRowsModified();
          onWrite();
          return { changes };
        },
        get(...params) {
          return query(sql, params)[0];
        },
        all(...params) {
          return query(sql, params);
        },
      };
    },
    close() {
      db.close();
    },
  };
}

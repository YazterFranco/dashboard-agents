// Modo app: la base de datos en memoria de las pruebas usa sql.js (la de la app de Android) en lugar de node:sqlite.
import initSqlJs from 'sql.js';

(globalThis as { __luccaTestSqlJs?: unknown }).__luccaTestSqlJs = await initSqlJs();

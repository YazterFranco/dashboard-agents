import type { AgentStatus } from './types.js';

export const DEFAULT_PORT = 4820;
export const DEFAULT_HOST = '127.0.0.1';
export const STALE_AFTER_MS = 10 * 60 * 1000;
export const REPLAY_WINDOW_MS = 24 * 60 * 60 * 1000;
export const RETENTION_DAYS = 7;
export const RAW_MAX_BYTES = 8192;
export const SUMMARY_MAX = 120;
export const TEXT_MAX = 500;
export const REDACTED = '«redactado»';

export const STATUS_LABELS: Record<AgentStatus, string> = {
  working: 'Trabajando',
  waiting: 'Esperando input',
  error: 'Error',
  done: 'Terminado',
  stale: 'Inactivo',
};

import type { Lang, Settings, Task, Theme, WeekProgress } from '@lucca/shared';

/** Respuesta no 2xx del servidor. Un fallo de red NO es un `ApiError`: llega como el `TypeError` del navegador. */
export class ApiError extends Error {
  readonly attemptsLeft?: number;
  readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    readonly status: number,
    readonly fields: Record<string, string> = {},
    extra: { attemptsLeft?: number; retryAfterSeconds?: number } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.attemptsLeft = extra.attemptsLeft;
    this.retryAfterSeconds = extra.retryAfterSeconds;
  }
}

export interface Connections {
  ai: boolean;
  mereb: boolean;
}

export interface ParentStatus {
  setupDone: boolean;
  authenticated: boolean;
  locked: boolean;
  retryAfterSeconds: number;
  connections: Connections;
}

export interface Overview {
  today: string;
  weekStart: string;
  settings: Settings;
  tasks: Task[];
  connections: Connections;
}

export interface ParentProgress {
  weeks: WeekProgress[];
  needsHelp: { weekStart: string; taskId: string; title: string; count: number }[];
}

export interface SetupInput {
  pin: string;
  childName: string;
  grade: number;
  lang: Lang;
  theme: Theme;
}

export interface TaskBody {
  subject: string;
  subjectLabel?: string;
  title: string;
  titleEn?: string;
  description?: string;
  assignedDate: string | null;
  dueDate: string | null;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin' };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  let data: unknown;
  try {
    data = res.status === 204 ? undefined : await res.json();
  } catch {
    data = undefined;
  }
  if (!res.ok) {
    const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
    const fields = d.fields && typeof d.fields === 'object' ? (d.fields as Record<string, string>) : {};
    throw new ApiError(typeof d.error === 'string' ? d.error : `Error ${res.status}`, res.status, fields, {
      attemptsLeft: typeof d.attemptsLeft === 'number' ? d.attemptsLeft : undefined,
      retryAfterSeconds: typeof d.retryAfterSeconds === 'number' ? d.retryAfterSeconds : undefined,
    });
  }
  return data as T;
}

export const parentApi = {
  status: () => request<ParentStatus>('GET', '/api/parent/status'),
  setup: (body: SetupInput) => request<{ ok: true }>('POST', '/api/parent/setup', body),
  login: (pin: string) => request<{ ok: true }>('POST', '/api/parent/login', { pin }),
  logout: () => request<void>('POST', '/api/parent/logout'),
  changePin: (currentPin: string, newPin: string) => request<{ ok: true }>('PUT', '/api/parent/pin', { currentPin, newPin }),
  overview: () => request<Overview>('GET', '/api/parent/overview'),
  createTask: (body: TaskBody) => request<Task>('POST', '/api/parent/tasks', body),
  patchTask: (id: string, patch: Partial<TaskBody> & { status?: string; hidden?: boolean }) =>
    request<Task>('PATCH', `/api/parent/tasks/${encodeURIComponent(id)}`, patch),
  deleteTask: (id: string) => request<{ result: 'removed' | 'retired' }>('DELETE', `/api/parent/tasks/${encodeURIComponent(id)}`),
  saveSettings: (patch: Partial<Omit<Settings, 'tz'>>) => request<Settings>('PUT', '/api/parent/settings', patch),
  progress: (weeks: number) => request<ParentProgress>('GET', `/api/parent/progress?weeks=${weeks}`),
};
export type ParentApi = typeof parentApi;

/**
 * Envuelve la API: un 401 en una petición protegida avisa que la sesión caducó. Quedan fuera las que no dependen de la
 * sesión (estado, configuración, entrada y salida) y el cambio de PIN cuando el 401 trae `attemptsLeft`: ahí es "PIN actual incorrecto".
 */
export function withExpiry(api: ParentApi, onExpired: () => void): ParentApi {
  const guarded = {} as Record<string, unknown>;
  for (const [name, fn] of Object.entries(api) as [keyof ParentApi, (...args: never[]) => Promise<unknown>][]) {
    if (name === 'status' || name === 'login' || name === 'setup' || name === 'logout') {
      guarded[name] = fn;
      continue;
    }
    guarded[name] = async (...args: never[]) => {
      try {
        return await fn(...args);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401 && err.attemptsLeft === undefined) onExpired();
        throw err;
      }
    };
  }
  return guarded as unknown as ParentApi;
}

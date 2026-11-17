import { KidStateSchema, type KidState, type ProgressKind, type TaskStatus } from '@lucca/shared';

export async function fetchState(): Promise<KidState> {
  const res = await fetch('/api/kid/state');
  if (!res.ok) throw new Error(`state ${res.status}`);
  return KidStateSchema.parse(await res.json());
}

export async function postProgress(taskId: string, kind: ProgressKind): Promise<{ status: TaskStatus; starsThisWeek: number }> {
  const res = await fetch('/api/kid/progress', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ taskId, kind }),
  });
  if (!res.ok) throw new Error(`progress ${res.status}`);
  return (await res.json()) as { status: TaskStatus; starsThisWeek: number };
}

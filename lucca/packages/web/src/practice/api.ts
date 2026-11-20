import type { PracticeItem } from '@lucca/shared';

export type PracticeAnswer =
  | { status: 'ready'; source: 'math' | 'lesson'; items: PracticeItem[] }
  | { status: 'unavailable'; reason: 'no-ai' | 'cap' | 'slow' };

export async function fetchPractice(taskId: string): Promise<PracticeAnswer> {
  const res = await fetch(`/api/kid/practice/${encodeURIComponent(taskId)}`, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`practice ${res.status}`);
  return (await res.json()) as PracticeAnswer;
}

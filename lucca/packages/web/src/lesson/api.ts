import { LessonDocSchema, type LessonDoc } from '@lucca/shared';

export type LessonVariant = 'default' | 'alternative';
export type LessonAnswer =
  | { status: 'ready'; lesson: { doc: LessonDoc; variant: LessonVariant; source: 'ai' | 'recorded' | 'fallback' } }
  | { status: 'unavailable'; reason: 'no-ai' | 'cap' | 'slow' };

/** Pide la lección de una tarea. Lanza si no hay conexión o el servidor falla; valida el documento antes de dibujarlo. */
export async function fetchLesson(taskId: string, variant: LessonVariant, base = '/api/kid/lessons'): Promise<LessonAnswer> {
  const url = `${base}/${encodeURIComponent(taskId)}${variant === 'alternative' ? '?variant=alternative' : ''}`;
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`lesson ${res.status}`);
  const body = (await res.json()) as LessonAnswer;
  if (body.status === 'ready') body.lesson.doc = LessonDocSchema.parse(body.lesson.doc);
  return body;
}

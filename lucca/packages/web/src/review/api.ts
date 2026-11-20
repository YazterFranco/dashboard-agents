import { QuizBlockSchema, type QuizBlock, type Subject } from '@lucca/shared';

export interface ReviewItemView {
  id: string;
  subject: Subject;
  taskTitle: string;
  question: QuizBlock;
}
export interface ReviewToday {
  today: string;
  items: ReviewItemView[];
  doneToday: boolean;
}

async function call<T>(method: 'GET' | 'POST', url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  if (!res.ok) throw new Error(`review ${res.status}`);
  return (await res.json()) as T;
}

export const reviewApi = {
  async today(): Promise<ReviewToday> {
    const r = await call<ReviewToday>('GET', '/api/kid/review');
    return { ...r, items: r.items.map((i) => ({ ...i, question: QuizBlockSchema.parse(i.question) })) };
  },
  answer: (id: string, correct: boolean) => call<{ box: number; dueDate: string }>('POST', `/api/kid/review/${encodeURIComponent(id)}`, { correct }),
  finish: () => call<{ starGained: boolean; starsThisWeek: number }>('POST', '/api/kid/review/finish'),
};
export type ReviewApi = typeof reviewApi;

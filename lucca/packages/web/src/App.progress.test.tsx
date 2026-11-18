// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { demoState } from './testFixtures';
import { App } from './App';

// Un WeekScreen mínimo: expone el resultado de onProgress y lo que App guarda en el estado.
vi.mock('./components/WeekScreen', () => ({
  WeekScreen: (props: {
    state: { starsThisWeek: number; tasks: { id: string; status: string }[] };
    onProgress: (taskId: string, kind: string) => Promise<unknown>;
  }) => (
    <div>
      <span data-testid="stars">{props.state.starsThisWeek}</span>
      <span data-testid="status">{props.state.tasks.find((t) => t.id === 'tue-sci')?.status}</span>
      <output data-testid="result" />
      <button
        type="button"
        onClick={async () => {
          const r = await props.onProgress('tue-sci', 'task_done');
          screen.getByTestId('result').textContent = JSON.stringify(r);
        }}
      >
        enviar
      </button>
    </div>
  ),
}));

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubFetch(post: () => Promise<unknown>) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return post();
    expect(url).toBe('/api/kid/state');
    return { ok: true, json: async () => demoState() };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function send() {
  render(<App />);
  await screen.findByTestId('stars');
  fireEvent.click(screen.getByRole('button', { name: 'enviar' }));
  await waitFor(() => expect(screen.getByTestId('result').textContent).not.toBe(''));
  return JSON.parse(screen.getByTestId('result').textContent!);
}

describe('App onProgress', () => {
  it('updates the task status and the stars with what the server answers', async () => {
    const fetchMock = stubFetch(async () => ({ ok: true, json: async () => ({ status: 'done', starsThisWeek: 8 }) }));
    const result = await send();
    expect(result).toEqual({ ok: true, starsGained: 1 });
    expect(screen.getByTestId('stars').textContent).toBe('8');
    expect(screen.getByTestId('status').textContent).toBe('done');
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(post[0]).toBe('/api/kid/progress');
    expect(JSON.parse(String(post[1]!.body))).toEqual({ taskId: 'tue-sci', kind: 'task_done' });
  });

  it('reports no stars gained when the server already counted that star', async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ status: 'done', starsThisWeek: 7 }) }));
    expect(await send()).toEqual({ ok: true, starsGained: 0 });
  });

  it('keeps the state when the request fails', async () => {
    stubFetch(async () => {
      throw new TypeError('network down');
    });
    expect(await send()).toEqual({ ok: false });
    expect(screen.getByTestId('stars').textContent).toBe('7');
    expect(screen.getByTestId('status').textContent).toBe('doing');
  });

  it('keeps the state on a non-2xx answer', async () => {
    stubFetch(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    expect(await send()).toEqual({ ok: false });
    expect(screen.getByTestId('stars').textContent).toBe('7');
    expect(screen.getByTestId('status').textContent).toBe('doing');
  });
});

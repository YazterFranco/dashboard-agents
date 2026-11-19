// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { task } from '../testFixtures';
import { ApiError, type Overview, type ParentApi } from './api';
import { Dashboard } from './Dashboard';

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.theme;
});

const overview = (over: Partial<Overview> = {}): Overview => ({
  today: '2026-11-18',
  weekStart: '2026-11-16',
  settings: { childName: 'Lucca', grade: 2, lang: 'es', voiceMode: 'both', theme: 'dark', speechRate: 0.9, tz: 'America/Panama', aiMonthlyCapUsd: 20 },
  tasks: [task({ id: 'a', title: 'Sumas con llevadas', assignedDate: '2026-11-17', dueDate: '2026-11-18' })],
  connections: { ai: false, mereb: false },
  ai: { mode: 'recorded', monthCostUsd: 0, capUsd: 20, alerts: [] },
  ...over,
});

function setup(over: Record<string, unknown> = {}) {
  const api = {
    overview: vi.fn(async () => overview()),
    patchTask: vi.fn(async () => ({})),
    progress: vi.fn(async () => ({ weeks: [], needsHelp: [] })),
    saveSettings: vi.fn(async () => ({})),
    changePin: vi.fn(async () => ({ ok: true })),
    ...over,
  } as unknown as ParentApi;
  const onLogout = vi.fn();
  render(<Dashboard api={api} onLogout={onLogout} />);
  return { api, onLogout, overview: api.overview as unknown as ReturnType<typeof vi.fn> };
}

describe('Dashboard', () => {
  it('shows the child and the tasks tab first', async () => {
    setup();
    expect(await screen.findByText('Lucca')).toBeTruthy();
    expect(screen.getByText('2.º grado')).toBeTruthy();
    expect(screen.getByText('Sumas con llevadas')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tareas' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Progreso' }).getAttribute('aria-current')).toBeNull();
  });

  it('switches between the three sections and marks the current one', async () => {
    const { api } = setup();
    await screen.findByText('Lucca');
    fireEvent.click(screen.getByRole('button', { name: 'Progreso' }));
    expect(screen.getByRole('button', { name: 'Progreso' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Tareas' }).getAttribute('aria-current')).toBeNull();
    await waitFor(() => expect(api.progress).toHaveBeenCalledWith(4));
    expect(screen.queryByText('Sumas con llevadas')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ajustes' }));
    expect(await screen.findByRole('button', { name: 'Guardar ajustes' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tareas' }));
    expect(screen.getByText('Sumas con llevadas')).toBeTruthy();
  });

  it('after changing a task it asks the server again and shows the new data', async () => {
    const calls = vi.fn();
    const overviewFn = vi.fn(async () => {
      calls();
      return calls.mock.calls.length === 1
        ? overview()
        : overview({ tasks: [task({ id: 'a', title: 'Sumas con llevadas', assignedDate: '2026-11-17', dueDate: '2026-11-18', status: 'done' })] });
    });
    setup({ overview: overviewFn });
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar lista: Sumas con llevadas' }));
    expect(await screen.findByRole('button', { name: 'Marcar por hacer: Sumas con llevadas' })).toBeTruthy();
    expect(overviewFn).toHaveBeenCalledTimes(2);
  });

  it('keeps showing the data while it refreshes', async () => {
    let second!: (o: Overview) => void;
    const overviewFn = vi.fn().mockResolvedValueOnce(overview()).mockImplementationOnce(() => new Promise<Overview>((r) => (second = r)));
    setup({ overview: overviewFn });
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar lista: Sumas con llevadas' }));
    await waitFor(() => expect(overviewFn).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Sumas con llevadas')).toBeTruthy();
    second(overview());
  });

  it('a lost connection shows a friendly message with a retry that works', async () => {
    const overviewFn = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(overview());
    setup({ overview: overviewFn });
    expect((await screen.findByRole('alert')).textContent).toContain('No se pudo conectar');
    expect(document.body.textContent).not.toMatch(/failed to fetch/i);
    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }));
    expect(await screen.findByText('Lucca')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a server error shows a message too', async () => {
    setup({ overview: vi.fn(async () => Promise.reject(new ApiError('boom', 500))) });
    expect((await screen.findByRole('alert')).textContent).toContain('No se pudieron cargar los datos');
  });

  it('applies the saved theme', async () => {
    setup({ overview: vi.fn(async () => overview({ settings: { ...overview().settings, theme: 'light' } })) });
    await screen.findByText('Lucca');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('"Salir" and the link to the child screen are always there', async () => {
    const { onLogout } = setup();
    await screen.findByText('Lucca');
    fireEvent.click(screen.getByRole('button', { name: 'Salir' }));
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Ver la pantalla de Lucca' }).getAttribute('href')).toBe('/');
  });
});

describe('Dashboard lesson preview', () => {
  const lessonDoc = {
    title: { es: [{ text: 'Sumas' }], en: [{ text: 'Sums' }] },
    screens: [1, 2, 3, 4].map((n) => ({ blocks: [{ type: 'explain' as const, text: { es: [{ text: `Pantalla ${n}.` }], en: [{ text: `Screen ${n}.` }] } }] })),
    quiz: [{ type: 'trueFalse' as const, statement: { es: [{ text: 'Sumar junta.' }], en: [{ text: 'Adding.' }] }, answer: true }],
  };
  const ready = { status: 'ready' as const, lesson: { doc: lessonDoc, variant: 'default' as const, source: 'recorded' as const } };

  it('"Ver lección" opens the lesson as Lucca sees it, without progress, and closes back to the tasks', async () => {
    const lesson = vi.fn(async () => ready);
    setup({ lesson });
    fireEvent.click(await screen.findByRole('button', { name: 'Ver lección: Sumas con llevadas' }));
    expect(await screen.findByText('Pantalla 1.')).toBeTruthy();
    expect(screen.getByText(/Nada de lo que hagas aquí cuenta como progreso/)).toBeTruthy();
    expect(lesson).toHaveBeenCalledWith('a');
    fireEvent.click(screen.getByRole('button', { name: /Cerrar la vista previa/ }));
    expect(await screen.findByText('Sumas con llevadas')).toBeTruthy();
  });

  it('"Regenerar lección" asks for a new one and shows it', async () => {
    const lesson = vi.fn(async () => ready);
    const regenerateLesson = vi.fn(async () => ready);
    setup({ lesson, regenerateLesson });
    fireEvent.click(await screen.findByRole('button', { name: 'Ver lección: Sumas con llevadas' }));
    await screen.findByText('Pantalla 1.');
    fireEvent.click(screen.getByRole('button', { name: 'Regenerar lección' }));
    expect(await screen.findByText('Lección nueva lista.')).toBeTruthy();
    expect(regenerateLesson).toHaveBeenCalledWith('a');
    await waitFor(() => expect(lesson).toHaveBeenCalledTimes(2));
  });

  it('without AI the preview says what Lucca would see', async () => {
    setup({ lesson: vi.fn(async () => ({ status: 'unavailable', reason: 'no-ai' })) });
    fireEvent.click(await screen.findByRole('button', { name: 'Ver lección: Sumas con llevadas' }));
    expect(await screen.findByText('Esta tarea la vemos con papá.')).toBeTruthy();
  });
});


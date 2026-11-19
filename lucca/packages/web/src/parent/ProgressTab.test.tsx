// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiError, type ParentApi, type ParentProgress } from './api';
import { ProgressTab } from './ProgressTab';

afterEach(cleanup);

const week = (weekStart: string, over: Partial<ParentProgress['weeks'][number]> = {}): ParentProgress['weeks'][number] => ({
  weekStart,
  total: 0,
  done: 0,
  pending: 0,
  stars: 0,
  hints: 0,
  helpRequests: 0,
  ...over,
});

function setup(result: ParentProgress | (() => Promise<ParentProgress>)) {
  const progress = vi.fn(typeof result === 'function' ? result : async () => result);
  render(<ProgressTab api={{ progress } as unknown as ParentApi} />);
  return { progress };
}

const data: ParentProgress = {
  weeks: [
    week('2026-11-16', { total: 8, done: 5, pending: 3, stars: 7, hints: 2, helpRequests: 3 }),
    week('2026-11-09', { total: 6, done: 6, stars: 1, hints: 1, helpRequests: 1 }),
    week('2026-11-02'),
    week('2026-10-26'),
  ],
  needsHelp: [
    { weekStart: '2026-11-16', taskId: 't1', title: 'Sumas con llevadas', count: 2 },
    { weekStart: '2026-11-09', taskId: 't2', title: 'Restas', count: 1 },
  ],
};

describe('ProgressTab positive', () => {
  it('asks for the last 4 weeks and shows each one with its range, bar, stars and hints', async () => {
    const { progress } = setup(data);
    expect(screen.getByText('Un momento…')).toBeTruthy();
    expect(await screen.findByText('16 – 20 de noviembre')).toBeTruthy();
    expect(progress).toHaveBeenCalledWith(4);
    const current = within(screen.getByRole('region', { name: '16 – 20 de noviembre' }));
    const bar = current.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('5');
    expect(bar.getAttribute('aria-valuemax')).toBe('8');
    expect(bar.getAttribute('aria-label')).toBe('5 de 8 tareas listas');
    expect(current.getByText('7 estrellas')).toBeTruthy();
    expect(current.getByText('2 pistas usadas')).toBeTruthy();
    expect(screen.getByText('9 – 13 de noviembre')).toBeTruthy();
  });

  it('lists who needed help, with how many times and in which week', async () => {
    setup(data);
    const help = within(await screen.findByRole('region', { name: 'Necesita ayuda' }));
    expect(help.getByText('Sumas con llevadas')).toBeTruthy();
    expect(help.getByText('Pidió ayuda 2 veces')).toBeTruthy();
    expect(help.getByText('Restas')).toBeTruthy();
    expect(help.getByText('Pidió ayuda 1 vez')).toBeTruthy();
    expect(help.getByText('Semana: 16 – 20 de noviembre')).toBeTruthy();
  });

  it('uses the singular for one star and one hint', async () => {
    setup({ weeks: [week('2026-11-16', { total: 2, done: 1, pending: 1, stars: 1, hints: 1 })], needsHelp: [] });
    expect(await screen.findByText('1 estrella')).toBeTruthy();
    expect(screen.getByText('1 pista usada')).toBeTruthy();
  });
});

describe('ProgressTab edge', () => {
  it('a week without any activity says so for this week', async () => {
    setup({ weeks: [week('2026-11-16', { total: 5, pending: 5 }), week('2026-11-09')], needsHelp: [] });
    expect(await screen.findByText('Todavía no hay actividad de Lucca esta semana')).toBeTruthy();
  });

  it('no activity message when this week has some', async () => {
    setup(data);
    await screen.findByText('16 – 20 de noviembre');
    expect(screen.queryByText('Todavía no hay actividad de Lucca esta semana')).toBeNull();
  });

  it('nobody asked for help: the section says so instead of disappearing', async () => {
    setup({ weeks: [week('2026-11-16')], needsHelp: [] });
    const help = within(await screen.findByRole('region', { name: 'Necesita ayuda' }));
    expect(help.getByText('Lucca no ha pedido ayuda en estas semanas')).toBeTruthy();
  });

  it('a week with no tasks shows an empty bar without breaking', async () => {
    setup({ weeks: [week('2026-11-16')], needsHelp: [] });
    const bar = (await screen.findByRole('progressbar')) as HTMLElement;
    expect(bar.getAttribute('aria-valuemax')).toBe('0');
    expect(bar.getAttribute('aria-label')).toBe('0 de 0 tareas listas');
  });

  it('shows a task title as text, never as markup', async () => {
    setup({ weeks: [week('2026-11-16')], needsHelp: [{ weekStart: '2026-11-16', taskId: 'x', title: '<img src=x onerror=alert(1)>', count: 1 }] });
    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
  });
});

describe('ProgressTab negative', () => {
  it('a lost connection shows a friendly message and a retry that works', async () => {
    const progress = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(data);
    render(<ProgressTab api={{ progress } as unknown as ParentApi} />);
    expect((await screen.findByRole('alert')).textContent).toContain('No se pudo cargar el progreso. Revisa que el asistente siga encendido.');
    expect(document.body.textContent).not.toMatch(/failed to fetch/i);
    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }));
    expect(await screen.findByText('16 – 20 de noviembre')).toBeTruthy();
  });

  it('a server error shows the same friendly message', async () => {
    setup(() => Promise.reject(new ApiError('boom', 500)));
    expect((await screen.findByRole('alert')).textContent).toContain('No se pudo cargar el progreso');
  });

  it('an expired session (401) shows no message of its own', async () => {
    const { progress } = setup(() => Promise.reject(new ApiError('Hace falta el PIN', 401)));
    await waitFor(() => expect(progress).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('Un momento…')).toBeNull());
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError, type ParentApi } from './api';
import { ParentApp } from './ParentApp';

afterEach(cleanup);

type StatusBody = Awaited<ReturnType<ParentApi['status']>>;
const status = (over: Partial<StatusBody> = {}): StatusBody => ({
  setupDone: true,
  authenticated: false,
  locked: false,
  retryAfterSeconds: 0,
  connections: { ai: false, mereb: false },
  ...over,
});
const overviewBody = { today: '2026-11-18', weekStart: '2026-11-16', settings: { childName: 'Lucca', grade: 2, lang: 'es', voiceMode: 'both', theme: 'dark', speechRate: 0.9, tz: 'America/Panama', aiMonthlyCapUsd: 20, pauseMinutes: 25 }, tasks: [], connections: { ai: false, mereb: false } };

function fakeApi(over: Partial<Record<keyof ParentApi, unknown>> = {}): ParentApi {
  const base = {
    status: async () => status(),
    setup: async () => ({ ok: true }),
    login: async () => ({ ok: true }),
    logout: async () => undefined,
    changePin: async () => ({ ok: true }),
    overview: async () => overviewBody,
    createTask: async () => ({}),
    patchTask: async () => ({}),
    deleteTask: async () => ({ result: 'removed' }),
    saveSettings: async () => ({}),
    progress: async () => ({ weeks: [], needsHelp: [] }),
  };
  return { ...base, ...over } as unknown as ParentApi;
}

describe('ParentApp', () => {
  it('shows a short wait first', () => {
    render(<ParentApp api={fakeApi({ status: () => new Promise(() => {}) })} />);
    expect(screen.getByText('Un momento…')).toBeTruthy();
  });

  it('shows the setup when nothing is configured', async () => {
    render(<ParentApp api={fakeApi({ status: async () => status({ setupDone: false }) })} />);
    expect(await screen.findByRole('heading', { name: 'Configura el asistente de Lucca' })).toBeTruthy();
  });

  it('asks for the PIN when it is configured but there is no session', async () => {
    render(<ParentApp api={fakeApi()} />);
    expect(await screen.findByLabelText('PIN')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /panel/i })).toBeNull();
  });

  it('goes straight to the panel when there is a session', async () => {
    render(<ParentApp api={fakeApi({ status: async () => status({ authenticated: true }) })} />);
    expect(await screen.findByRole('heading', { name: 'Área de papá' })).toBeTruthy();
    expect(await screen.findByText('Lucca')).toBeTruthy();
  });

  it('shows the lock countdown when the status says it is locked', async () => {
    render(<ParentApp api={fakeApi({ status: async () => status({ locked: true, retryAfterSeconds: 120 }) })} />);
    expect((await screen.findByRole('timer')).textContent).toBe('2:00');
  });

  it('a network failure shows a friendly screen with a retry that works', async () => {
    const statusFn = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(status());
    render(<ParentApp api={fakeApi({ status: statusFn })} />);
    await screen.findByText('No se pudo conectar con el asistente. Revisa que siga encendido.');
    expect(document.body.textContent).not.toMatch(/failed to fetch|typeerror/i);
    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }));
    expect(await screen.findByLabelText('PIN')).toBeTruthy();
  });

  it('an unexpected server answer also shows the friendly screen', async () => {
    render(<ParentApp api={fakeApi({ status: async () => Promise.reject(new ApiError('boom', 500)) })} />);
    expect(await screen.findByRole('button', { name: 'Intentar de nuevo' })).toBeTruthy();
  });

  it('after a correct PIN it shows the panel', async () => {
    const statusFn = vi.fn().mockResolvedValueOnce(status()).mockResolvedValue(status({ authenticated: true }));
    render(<ParentApp api={fakeApi({ status: statusFn })} />);
    fireEvent.change(await screen.findByLabelText('PIN'), { target: { value: '482913' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('heading', { name: 'Área de papá' })).toBeTruthy();
  });

  it('a 401 inside the panel goes back to the PIN with the inactivity notice', async () => {
    const api = fakeApi({
      status: async () => status({ authenticated: true }),
      overview: async () => Promise.reject(new ApiError('Hace falta el PIN', 401)),
    });
    render(<ParentApp api={api} />);
    expect(await screen.findByLabelText('PIN')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Tu sesión terminó por inactividad. Escribe tu PIN para seguir.');
  });

  it('"Salir" closes the session and shows the PIN again, without the data', async () => {
    const logout = vi.fn(async () => undefined);
    render(<ParentApp api={fakeApi({ status: async () => status({ authenticated: true }), logout })} />);
    await screen.findByText('Lucca');
    fireEvent.click(screen.getByRole('button', { name: 'Salir' }));
    expect(await screen.findByLabelText('PIN')).toBeTruthy();
    expect(logout).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Lucca')).toBeNull();
  });

  it('"Salir" still shows the PIN when the network fails while closing', async () => {
    render(<ParentApp api={fakeApi({ status: async () => status({ authenticated: true }), logout: async () => Promise.reject(new TypeError('red')) })} />);
    await screen.findByText('Lucca');
    fireEvent.click(screen.getByRole('button', { name: 'Salir' }));
    expect(await screen.findByLabelText('PIN')).toBeTruthy();
  });

  it('after finishing the setup it shows the panel', async () => {
    const statusFn = vi.fn().mockResolvedValueOnce(status({ setupDone: false })).mockResolvedValue(status({ authenticated: true }));
    render(<ParentApp api={fakeApi({ status: statusFn })} />);
    fireEvent.change(await screen.findByLabelText('PIN'), { target: { value: '482913' } });
    fireEvent.change(screen.getByLabelText('Repite el PIN'), { target: { value: '482913' } });
    fireEvent.change(screen.getByLabelText('Nombre del niño'), { target: { value: 'Lucca' } });
    fireEvent.click(screen.getByRole('button', { name: 'Terminar configuración' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Área de papá' })).toBeTruthy());
  });

  it('has a link back to the child screen', async () => {
    render(<ParentApp api={fakeApi({ status: async () => status({ authenticated: true }) })} />);
    expect((await screen.findByRole('link', { name: 'Ver la pantalla de Lucca' })).getAttribute('href')).toBe('/');
  });
});

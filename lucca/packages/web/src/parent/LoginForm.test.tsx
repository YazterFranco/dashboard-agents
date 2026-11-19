// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError, type ParentApi } from './api';
import { LoginForm } from './LoginForm';

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: false }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup(opts: { login?: ParentApi['login']; retryAfterSeconds?: number; notice?: string } = {}) {
  const api = { login: vi.fn(opts.login ?? (async () => ({ ok: true }))) } as unknown as ParentApi;
  const onSuccess = vi.fn();
  render(<LoginForm api={api} retryAfterSeconds={opts.retryAfterSeconds ?? 0} notice={opts.notice} onSuccess={onSuccess} />);
  return { onSuccess, loginSpy: api.login as unknown as ReturnType<typeof vi.fn> };
}
const pinInput = () => screen.getByLabelText('PIN') as HTMLInputElement;
const enter = async (value: string) => {
  fireEvent.change(pinInput(), { target: { value } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  });
};
const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe('LoginForm positive', () => {
  it('enters with the right PIN', async () => {
    const { loginSpy, onSuccess } = setup();
    await enter('482913');
    expect(loginSpy).toHaveBeenCalledWith('482913');
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('has a visible label and hides the digits', () => {
    setup();
    expect(pinInput().type).toBe('password');
    expect(pinInput().inputMode).toBe('numeric');
    expect(pinInput().maxLength).toBe(6);
  });

  it('shows the inactivity notice when the session ended', () => {
    setup({ notice: 'Tu sesión terminó por inactividad. Escribe tu PIN para seguir.' });
    expect(screen.getByRole('status').textContent).toBe('Tu sesión terminó por inactividad. Escribe tu PIN para seguir.');
  });
});

describe('LoginForm negative', () => {
  it.each([
    ['nothing', '', 'Escribe tu PIN'],
    ['two digits', '12', 'El PIN debe tener de 4 a 6 dígitos'],
    ['letters', 'abcd', 'El PIN debe tener de 4 a 6 dígitos'],
    ['digits with a space', '12 34', 'El PIN debe tener de 4 a 6 dígitos'],
  ])('%s shows a message and does not ask the server', async (_n, value, message) => {
    const { loginSpy } = setup();
    await enter(value);
    expect(screen.getByRole('alert').textContent).toBe(message);
    expect(loginSpy).not.toHaveBeenCalled();
  });

  it('a wrong PIN says how many attempts are left and empties the field', async () => {
    setup({ login: async () => Promise.reject(new ApiError('PIN incorrecto', 401, {}, { attemptsLeft: 4 })) });
    await enter('000000');
    expect(screen.getByRole('alert').textContent).toBe('PIN incorrecto. Te quedan 4 intentos.');
    expect(pinInput().value).toBe('');
  });

  it('uses the singular for the last attempt', async () => {
    setup({ login: async () => Promise.reject(new ApiError('PIN incorrecto', 401, {}, { attemptsLeft: 1 })) });
    await enter('000000');
    expect(screen.getByRole('alert').textContent).toBe('PIN incorrecto. Te queda 1 intento.');
  });

  it('says it could not connect when the network fails', async () => {
    setup({ login: async () => Promise.reject(new TypeError('Failed to fetch')) });
    await enter('482913');
    expect(screen.getByRole('alert').textContent).toBe('No se pudo conectar. Revisa que el asistente siga encendido e inténtalo otra vez.');
  });

  it('shows the field message the server sends for a bad format', async () => {
    setup({ login: async () => Promise.reject(new ApiError('Datos inválidos', 400, { pin: 'El PIN debe tener de 4 a 6 dígitos' })) });
    await enter('482913');
    expect(screen.getByRole('alert').textContent).toBe('El PIN debe tener de 4 a 6 dígitos');
  });
});

describe('LoginForm edge', () => {
  it('a lock from the server shows the countdown and disables the form', async () => {
    setup({ login: async () => Promise.reject(new ApiError('Demasiados intentos', 423, {}, { retryAfterSeconds: 300 })) });
    await enter('000000');
    expect(screen.getByRole('timer').textContent).toBe('5:00');
    expect((screen.getByRole('button', { name: 'Entrar' }) as HTMLButtonElement).disabled).toBe(true);
    expect(pinInput().disabled).toBe(true);
  });

  it('the countdown goes down each second and re-enables the form at zero', async () => {
    setup({ retryAfterSeconds: 3 });
    expect(screen.getByRole('timer').textContent).toBe('0:03');
    await tick(1000);
    expect(screen.getByRole('timer').textContent).toBe('0:02');
    await tick(2000);
    expect(screen.queryByRole('timer')).toBeNull();
    expect(pinInput().disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'Entrar' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('writes the countdown as minutes and seconds', () => {
    setup({ retryAfterSeconds: 61 });
    expect(screen.getByRole('timer').textContent).toBe('1:01');
  });

  it('starts locked when the status says so', () => {
    setup({ retryAfterSeconds: 120 });
    expect(pinInput().disabled).toBe(true);
    expect(screen.getByText(/Demasiados intentos/)).toBeTruthy();
  });

  it('submits with Enter', async () => {
    const { onSuccess } = setup();
    fireEvent.change(pinInput(), { target: { value: '482913' } });
    await act(async () => {
      fireEvent.submit(pinInput().closest('form')!);
    });
    expect(onSuccess).toHaveBeenCalled();
  });

  it('a double click asks the server once', async () => {
    let finish!: () => void;
    const { loginSpy, onSuccess } = setup({ login: () => new Promise((r) => (finish = () => r({ ok: true }))) });
    fireEvent.change(pinInput(), { target: { value: '482913' } });
    const button = screen.getByRole('button', { name: 'Entrar' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(loginSpy).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('never prints the PIN as text', async () => {
    setup({ login: async () => Promise.reject(new ApiError('PIN incorrecto', 401, {}, { attemptsLeft: 4 })) });
    await enter('482913');
    expect(document.body.textContent).not.toContain('482913');
  });

  it('clears the error once the person starts typing again', async () => {
    setup({ login: async () => Promise.reject(new ApiError('PIN incorrecto', 401, {}, { attemptsLeft: 4 })) });
    await enter('000000');
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.change(pinInput(), { target: { value: '1' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

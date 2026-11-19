// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError, type ParentApi } from './api';
import { SetupForm } from './SetupForm';

afterEach(cleanup);

const connections = (ai = false, mereb = false) => ({ ai, mereb });

function setup(opts: { setup?: ParentApi['setup']; connections?: { ai: boolean; mereb: boolean } } = {}) {
  const api = { setup: vi.fn(opts.setup ?? (async () => ({ ok: true }))) } as unknown as ParentApi;
  const onDone = vi.fn();
  render(<SetupForm api={api} connections={opts.connections ?? connections()} onDone={onDone} />);
  return { api, onDone, setupSpy: api.setup as unknown as ReturnType<typeof vi.fn> };
}

const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Terminar configuración' }));
function fillValid(over: Partial<Record<'pin' | 'pin2' | 'name', string>> = {}) {
  type('PIN', over.pin ?? '482913');
  type('Repite el PIN', over.pin2 ?? over.pin ?? '482913');
  type('Nombre del niño', over.name ?? 'Lucca');
}
const alertFor = (label: string | RegExp) => {
  const field = screen.getByLabelText(label);
  const id = field.getAttribute('aria-describedby')?.split(' ').find((d) => d.endsWith('-error'));
  return id ? document.getElementById(id) : null;
};

describe('SetupForm positive', () => {
  it('sends every value and finishes', async () => {
    const { setupSpy, onDone } = setup();
    fillValid();
    fireEvent.change(screen.getByLabelText('Grado'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('radio', { name: 'English' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Claro' }));
    submit();
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(setupSpy).toHaveBeenCalledWith({ pin: '482913', childName: 'Lucca', grade: 3, lang: 'en', theme: 'light' });
  });

  it('starts with sensible defaults: grade 2, Spanish, dark', async () => {
    const { setupSpy, onDone } = setup();
    fillValid();
    submit();
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(setupSpy).toHaveBeenCalledWith(expect.objectContaining({ grade: 2, lang: 'es', theme: 'dark' }));
  });

  it('every field has a visible label', () => {
    setup();
    for (const label of ['PIN', 'Repite el PIN', 'Nombre del niño', 'Grado']) expect(screen.getByLabelText(label)).toBeTruthy();
  });
});

describe('SetupForm negative', () => {
  it.each([
    ['a PIN of 3 digits', { pin: '123' }, 'PIN', 'El PIN debe tener de 4 a 6 dígitos'],
    ['a PIN with letters', { pin: '12a4' }, 'PIN', 'El PIN debe tener de 4 a 6 dígitos'],
    ['a PIN with spaces', { pin: '12 34' }, 'PIN', 'El PIN debe tener de 4 a 6 dígitos'],
    ['a confirmation that differs', { pin: '482913', pin2: '482914' }, 'Repite el PIN', 'Los dos PIN deben ser iguales'],
    ['an empty name', { name: '' }, 'Nombre del niño', 'Escribe el nombre'],
    ['a name of spaces', { name: '   ' }, 'Nombre del niño', 'Escribe el nombre'],
    ['a name of 31 characters', { name: 'a'.repeat(31) }, 'Nombre del niño', 'El nombre puede tener hasta 30 letras'],
  ])('%s shows the message next to the field, sends nothing and puts the focus there', async (_n, over, label, message) => {
    const { setupSpy } = setup();
    fillValid(over);
    submit();
    expect(setupSpy).not.toHaveBeenCalled();
    expect(alertFor(label)!.textContent).toBe(message);
    expect(screen.getByLabelText(label).getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(screen.getByLabelText(label));
  });

  it('empty form: asks for the PIN first', () => {
    const { setupSpy } = setup();
    submit();
    expect(setupSpy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByLabelText('PIN'));
  });

  it('shows the errors the server reports, by field', async () => {
    setup({ setup: async () => Promise.reject(new ApiError('Datos inválidos', 400, { childName: 'Ese nombre no sirve' })) });
    fillValid();
    submit();
    await waitFor(() => expect(alertFor('Nombre del niño')!.textContent).toBe('Ese nombre no sirve'));
  });

  it('says it was already configured when the server answers 409', async () => {
    setup({ setup: async () => Promise.reject(new ApiError('La configuración ya se hizo', 409)) });
    fillValid();
    submit();
    expect((await screen.findByRole('alert')).textContent).toMatch(/ya se hizo/i);
  });

  it('says it could not connect when the network fails', async () => {
    setup({ setup: async () => Promise.reject(new TypeError('Failed to fetch')) });
    fillValid();
    submit();
    expect((await screen.findByRole('alert')).textContent).toBe('No se pudo guardar. Revisa que el asistente siga encendido e inténtalo otra vez.');
  });
});

describe('SetupForm edge', () => {
  it('accepts a name of exactly 30 characters', async () => {
    const { setupSpy, onDone } = setup();
    fillValid({ name: 'a'.repeat(30) });
    submit();
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(setupSpy.mock.calls[0][0].childName).toHaveLength(30);
  });

  it('trims the spaces around the name', async () => {
    const { setupSpy, onDone } = setup();
    fillValid({ name: '   Lucca   ' });
    submit();
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(setupSpy.mock.calls[0][0].childName).toBe('Lucca');
  });

  it('accepts the shortest and the longest PIN', async () => {
    for (const pin of ['0000', '123456']) {
      cleanup();
      const { setupSpy, onDone } = setup();
      fillValid({ pin });
      submit();
      await waitFor(() => expect(onDone).toHaveBeenCalled());
      expect(setupSpy.mock.calls[0][0].pin).toBe(pin);
    }
  });

  it('submits with Enter', async () => {
    const { onDone } = setup();
    fillValid();
    fireEvent.submit(screen.getByRole('button', { name: 'Terminar configuración' }).closest('form')!);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('a double click sends once', async () => {
    let finish!: () => void;
    const { setupSpy, onDone } = setup({ setup: () => new Promise((r) => (finish = () => r({ ok: true }))) });
    fillValid();
    submit();
    submit();
    expect(setupSpy).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it('validates a field when leaving it, and clears the message as soon as it is right', () => {
    setup();
    const pin = screen.getByLabelText('PIN');
    fireEvent.change(pin, { target: { value: '12' } });
    expect(alertFor('PIN')).toBeNull();
    fireEvent.blur(pin);
    expect(alertFor('PIN')!.textContent).toBe('El PIN debe tener de 4 a 6 dígitos');
    fireEvent.change(pin, { target: { value: '1234' } });
    expect(alertFor('PIN')).toBeNull();
  });

  it('does not complain about an empty field the person has not visited', () => {
    setup();
    fireEvent.blur(screen.getByLabelText('Nombre del niño'));
    expect(alertFor('Nombre del niño')!.textContent).toBe('Escribe el nombre');
    expect(alertFor('PIN')).toBeNull();
  });

  it('missing connections explain how to add them but never block finishing', async () => {
    const { onDone } = setup({ connections: connections(false, false) });
    expect(screen.getByText(/ANTHROPIC_API_KEY/)).toBeTruthy();
    expect(screen.getByText(/MEREB_URL/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Terminar configuración' }) as HTMLButtonElement).disabled).toBe(false);
    fillValid();
    submit();
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('shows a connected connection as connected, without instructions', () => {
    setup({ connections: connections(true, true) });
    expect(screen.getAllByText('Conectada').length).toBe(2);
    expect(screen.queryByText(/ANTHROPIC_API_KEY/)).toBeNull();
    expect(screen.queryByText(/MEREB_URL/)).toBeNull();
  });

  it('never shows the PIN as visible text', () => {
    setup();
    fillValid();
    expect((screen.getByLabelText('PIN') as HTMLInputElement).type).toBe('password');
    expect((screen.getByLabelText('Repite el PIN') as HTMLInputElement).type).toBe('password');
    expect(document.body.textContent).not.toContain('482913');
  });
});

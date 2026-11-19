// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SettingsSchema } from '@lucca/shared';
import { ApiError, type ParentApi } from './api';
import { SettingsTab } from './SettingsTab';

afterEach(cleanup);

const settings = SettingsSchema.parse({});

function setup(over: Record<string, unknown> = {}, connections = { ai: false, mereb: false }) {
  const api = {
    saveSettings: vi.fn(async () => settings),
    changePin: vi.fn(async () => ({ ok: true })),
    ...over,
  } as unknown as ParentApi;
  const onSaved = vi.fn();
  render(<SettingsTab settings={settings} connections={connections} onSaved={onSaved} api={api} />);
  return { onSaved, save: api.saveSettings as unknown as ReturnType<typeof vi.fn>, changePin: api.changePin as unknown as ReturnType<typeof vi.fn> };
}
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const saveSettings = () => fireEvent.click(screen.getByRole('button', { name: 'Guardar ajustes' }));
const savePin = () => fireEvent.click(screen.getByRole('button', { name: 'Cambiar PIN' }));
const errorOf = (label: string) => {
  const field = screen.getByLabelText(label);
  const id = field.getAttribute('aria-describedby')?.split(' ').find((d) => d.endsWith('-error'));
  return id ? document.getElementById(id) : null;
};

describe('SettingsTab positive', () => {
  it('shows the current values, with the speech rate written with a comma', () => {
    setup();
    expect((screen.getByLabelText('Nombre del niño') as HTMLInputElement).value).toBe('Lucca');
    expect((screen.getByLabelText('Grado') as HTMLSelectElement).value).toBe('2');
    expect((screen.getByLabelText('Velocidad de la voz') as HTMLInputElement).value).toBe('0,9');
    expect((screen.getByRole('radio', { name: 'Español' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('radio', { name: 'Voz y texto' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('radio', { name: 'Oscuro' }) as HTMLInputElement).checked).toBe(true);
  });

  it('saves only what changed and tells the parent', async () => {
    const { save, onSaved } = setup();
    fireEvent.click(screen.getByRole('radio', { name: 'Claro' }));
    saveSettings();
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith({ theme: 'light' });
    expect((await screen.findByText('Ajustes guardados')).getAttribute('role')).toBe('status');
  });

  it('saves several changes at once', async () => {
    const { save } = setup();
    type('Nombre del niño', '  Mateo ');
    type('Grado', '3');
    fireEvent.click(screen.getByRole('radio', { name: 'English' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Solo texto' }));
    type('Velocidad de la voz', '1,1');
    saveSettings();
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith({ childName: 'Mateo', grade: 3, lang: 'en', voiceMode: 'text', speechRate: 1.1 });
  });

  it('shows each connection as connected or missing', () => {
    setup({}, { ai: true, mereb: false });
    expect(screen.getByText('Conectada')).toBeTruthy();
    expect(screen.getByText('Falta conectar')).toBeTruthy();
    expect(screen.getByText(/MEREB_URL/)).toBeTruthy();
    expect(screen.queryByText(/ANTHROPIC_API_KEY/)).toBeNull();
  });
});

describe('SettingsTab negative', () => {
  it.each([
    ['a speed of 0,6', 'Velocidad de la voz', '0,6', 'La velocidad va de 0,7 a 1,2'],
    ['a speed of 1,3', 'Velocidad de la voz', '1,3', 'La velocidad va de 0,7 a 1,2'],
    ['a speed in letters', 'Velocidad de la voz', 'rápido', 'La velocidad va de 0,7 a 1,2'],
    ['an empty speed', 'Velocidad de la voz', '', 'La velocidad va de 0,7 a 1,2'],
    ['an empty name', 'Nombre del niño', '', 'Escribe el nombre'],
    ['a name of spaces', 'Nombre del niño', '   ', 'Escribe el nombre'],
    ['a name of 31 characters', 'Nombre del niño', 'a'.repeat(31), 'El nombre puede tener hasta 30 letras'],
  ])('%s shows the reason, sends nothing and puts the focus there', (_n, label, value, message) => {
    const { save } = setup();
    type(label, value);
    saveSettings();
    expect(save).not.toHaveBeenCalled();
    expect(errorOf(label)!.textContent).toBe(message);
    expect(document.activeElement).toBe(screen.getByLabelText(label));
  });

  it('shows the errors the server reports, by field, and does not say it saved', async () => {
    const { onSaved } = setup({ saveSettings: vi.fn(async () => Promise.reject(new ApiError('Datos inválidos', 400, { speechRate: 'La velocidad va de 0,7 a 1,2' }))) });
    type('Velocidad de la voz', '1,1');
    saveSettings();
    await waitFor(() => expect(errorOf('Velocidad de la voz')!.textContent).toBe('La velocidad va de 0,7 a 1,2'));
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.queryByText('Ajustes guardados')).toBeNull();
  });

  it('a lost connection says it could not save and keeps what was typed', async () => {
    setup({ saveSettings: vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))) });
    type('Nombre del niño', 'Mateo');
    saveSettings();
    expect((await screen.findByRole('alert')).textContent).toBe('No se pudo guardar. Revisa que el asistente siga encendido e inténtalo otra vez.');
    expect((screen.getByLabelText('Nombre del niño') as HTMLInputElement).value).toBe('Mateo');
  });
});

describe('SettingsTab edge', () => {
  it('without changes it does not call the server and says so', () => {
    const { save } = setup();
    saveSettings();
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText('No hay cambios que guardar')).toBeTruthy();
  });

  it.each([
    ['0,7', 0.7],
    ['1,2', 1.2],
    ['1.1', 1.1],
    [' 1,05 ', 1.05],
  ])('a speed of %s is valid and is sent as %s', async (text, number) => {
    const { save } = setup();
    type('Velocidad de la voz', text);
    saveSettings();
    await waitFor(() => expect(save).toHaveBeenCalledWith({ speechRate: number }));
  });

  it('writing back the same value is not a change', () => {
    const { save } = setup();
    type('Velocidad de la voz', '0.9');
    saveSettings();
    expect(save).not.toHaveBeenCalled();
  });

  it('a name of exactly 30 characters is accepted', async () => {
    const { save } = setup();
    type('Nombre del niño', 'a'.repeat(30));
    saveSettings();
    await waitFor(() => expect(save).toHaveBeenCalled());
  });

  it('a double click sends once', async () => {
    let finish!: () => void;
    const { save } = setup({ saveSettings: vi.fn(() => new Promise((r) => (finish = () => r(settings)))) });
    fireEvent.click(screen.getByRole('radio', { name: 'Claro' }));
    saveSettings();
    saveSettings();
    expect(save).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(screen.getByText('Ajustes guardados')).toBeTruthy());
  });

  it('a change after saving counts against the saved values, not the original ones', async () => {
    const { save, onSaved } = setup();
    fireEvent.click(screen.getByRole('radio', { name: 'Claro' }));
    saveSettings();
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('radio', { name: 'Claro' }));
    saveSettings();
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe('SettingsTab change PIN', () => {
  const fillPin = (current = '482913', next = '135790', again = next) => {
    type('PIN actual', current);
    type('PIN nuevo', next);
    type('Repite el PIN nuevo', again);
  };

  it('changes the PIN, says so and empties the fields', async () => {
    const { changePin } = setup();
    fillPin();
    savePin();
    expect((await screen.findByText('PIN cambiado. Usa el nuevo la próxima vez.')).getAttribute('role')).toBe('status');
    expect(changePin).toHaveBeenCalledWith('482913', '135790');
    for (const label of ['PIN actual', 'PIN nuevo', 'Repite el PIN nuevo']) expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe('');
  });

  it.each([
    ['an empty current PIN', ['', '135790', '135790'], 'PIN actual', 'Escribe tu PIN actual'],
    ['a new PIN that is too short', ['482913', '12', '12'], 'PIN nuevo', 'El PIN debe tener de 4 a 6 dígitos'],
    ['a new PIN with letters', ['482913', '12ab', '12ab'], 'PIN nuevo', 'El PIN debe tener de 4 a 6 dígitos'],
    ['a confirmation that differs', ['482913', '135790', '135791'], 'Repite el PIN nuevo', 'Los dos PIN deben ser iguales'],
  ])('%s shows the reason next to the field and sends nothing', (_n, [current, next, again], label, message) => {
    const { changePin } = setup();
    fillPin(current, next, again);
    savePin();
    expect(changePin).not.toHaveBeenCalled();
    expect(errorOf(label)!.textContent).toBe(message);
    expect(document.activeElement).toBe(screen.getByLabelText(label));
  });

  it('a wrong current PIN says how many attempts are left and empties that field', async () => {
    setup({ changePin: vi.fn(async () => Promise.reject(new ApiError('PIN actual incorrecto', 401, {}, { attemptsLeft: 4 }))) });
    fillPin();
    savePin();
    await waitFor(() => expect(errorOf('PIN actual')!.textContent).toBe('PIN actual incorrecto. Te quedan 4 intentos.'));
    expect((screen.getByLabelText('PIN actual') as HTMLInputElement).value).toBe('');
    expect(screen.queryByText(/PIN cambiado/)).toBeNull();
  });

  it('the last attempt uses the singular', async () => {
    setup({ changePin: vi.fn(async () => Promise.reject(new ApiError('PIN actual incorrecto', 401, {}, { attemptsLeft: 1 }))) });
    fillPin();
    savePin();
    await waitFor(() => expect(errorOf('PIN actual')!.textContent).toBe('PIN actual incorrecto. Te queda 1 intento.'));
  });

  it('a lock shows the time left', async () => {
    setup({ changePin: vi.fn(async () => Promise.reject(new ApiError('Demasiados intentos', 423, {}, { retryAfterSeconds: 300 }))) });
    fillPin();
    savePin();
    expect((await screen.findByRole('alert')).textContent).toBe('Demasiados intentos. Prueba otra vez en 5:00.');
  });

  it('a lost connection says it could not save', async () => {
    setup({ changePin: vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))) });
    fillPin();
    savePin();
    expect((await screen.findByRole('alert')).textContent).toBe('No se pudo guardar. Revisa que el asistente siga encendido e inténtalo otra vez.');
  });

  it('never prints a PIN as text and hides the digits', async () => {
    setup();
    fillPin();
    for (const label of ['PIN actual', 'PIN nuevo', 'Repite el PIN nuevo']) expect((screen.getByLabelText(label) as HTMLInputElement).type).toBe('password');
    savePin();
    await screen.findByText('PIN cambiado. Usa el nuevo la próxima vez.');
    expect(document.body.textContent).not.toMatch(/482913|135790/);
  });

  it('a double click changes it once', async () => {
    let finish!: () => void;
    const { changePin } = setup({ changePin: vi.fn(() => new Promise((r) => (finish = () => r({ ok: true })))) });
    fillPin();
    savePin();
    savePin();
    expect(changePin).toHaveBeenCalledTimes(1);
    finish();
    await screen.findByText('PIN cambiado. Usa el nuevo la próxima vez.');
  });
});

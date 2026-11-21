// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AgendaPreviewItem } from '@lucca/shared';
import { ApiError, type AgendaPreviewResponse, type ParentApi } from './api';
import { AgendaImport, importSummary } from './AgendaImport';

afterEach(cleanup);

const item = (over: Partial<AgendaPreviewItem>): AgendaPreviewItem => ({
  key: 'k',
  subject: 'math',
  subjectLabel: 'Matemáticas',
  title: 'Números romanos',
  description: 'Tipo de actividad: Ejercicio 3.',
  dueDate: '2026-11-25',
  kind: 'Ejercicio 3',
  state: 'new',
  ...over,
});

const PREVIEW: AgendaPreviewResponse = {
  weekStart: '2026-11-22',
  weekEnd: '2026-11-28',
  drafts: [
    item({ key: 'a', subject: 'social', subjectLabel: 'Ciencias Sociales', title: 'Himno Nacional', dueDate: '2026-11-23', kind: 'Evaluación Oral 1' }),
    item({ key: 'b' }),
    item({ key: 'c', subject: 'english', subjectLabel: 'Spelling / Phonics', title: 'Long O (o, oa, ow)', state: 'update' }),
    item({ key: 'd', subject: 'spanish', subjectLabel: 'Español', title: 'Caligrafía', dueDate: '2026-11-27', state: 'same' }),
    item({ key: 'e', subject: 'music', subjectLabel: 'Folklore / Danza', title: 'Cumbia', dueDate: '2026-11-27', state: 'removed' }),
  ],
};

function setup(over: Record<string, unknown> = {}) {
  const api = { importAgenda: vi.fn(async () => ({ added: 2, updated: 1, unchanged: 0, skipped: 0 })), ...over } as unknown as ParentApi;
  const onDone = vi.fn();
  const onCancel = vi.fn();
  render(<AgendaImport preview={PREVIEW} api={api} onDone={onDone} onCancel={onCancel} />);
  return { importAgenda: api.importAgenda as unknown as ReturnType<typeof vi.fn>, onDone, onCancel };
}

const checkbox = (title: string) => screen.getByRole('checkbox', { name: `Añadir: ${title}` }) as HTMLInputElement;

describe('AgendaImport: positivo', () => {
  it('resume lo encontrado y agrupa por día de la agenda', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Agenda del 22 al 28 de noviembre' })).toBeTruthy();
    expect(screen.getByText('Encontré 5 actividades. Revisa y elige cuáles añadir.')).toBeTruthy();
    const monday = within(screen.getByRole('group', { name: 'Lunes 23' }));
    expect(monday.getByText('Ciencias Sociales')).toBeTruthy();
    expect(monday.getByText('Evaluación Oral 1')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Miércoles 25' })).toBeTruthy();
  });

  it('marca las nuevas y las que cambiaron; las iguales quedan sin marcar', () => {
    setup();
    expect(checkbox('Himno Nacional').checked).toBe(true);
    expect(checkbox('Long O (o, oa, ow)').checked).toBe(true);
    expect(checkbox('Caligrafía').checked).toBe(false);
    expect(screen.getByText('Cambió en la agenda')).toBeTruthy();
    expect(screen.getByText('Ya está igual')).toBeTruthy();
  });

  it('una que papá quitó no se puede volver a añadir y lo dice', () => {
    setup();
    const box = checkbox('Cumbia');
    expect(box.checked).toBe(false);
    expect(box.disabled).toBe(true);
    expect(screen.getByText('La quitaste: no se vuelve a añadir')).toBeTruthy();
  });

  it('el botón cuenta las elegidas y envía solo esas, sin el estado', async () => {
    const { importAgenda, onDone } = setup();
    fireEvent.click(checkbox('Números romanos'));
    const add = screen.getByRole('button', { name: 'Añadir 2 tareas' });
    fireEvent.click(add);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const sent = importAgenda.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(sent.map((d) => d.key)).toEqual(['a', 'c']);
    expect(sent[0]).not.toHaveProperty('state');
    expect(onDone).toHaveBeenCalledWith({ added: 2, updated: 1, unchanged: 0, skipped: 0 }, ['2026-11-23', '2026-11-25']);
  });

  it('se puede corregir el título antes de añadir', async () => {
    const { importAgenda } = setup();
    fireEvent.change(screen.getByRole('textbox', { name: 'Título: Himno Nacional' }), { target: { value: 'Cantar el Himno Nacional' } });
    fireEvent.click(screen.getByRole('button', { name: 'Añadir 3 tareas' }));
    await waitFor(() => expect(importAgenda).toHaveBeenCalled());
    expect((importAgenda.mock.calls[0][0] as Array<{ title: string }>)[0].title).toBe('Cantar el Himno Nacional');
  });

  it('el detalle de cada actividad se puede abrir', () => {
    setup();
    expect(screen.getAllByText('Ver detalle').length).toBe(5);
  });
});

describe('AgendaImport: negativo', () => {
  it('sin ninguna elegida no se puede añadir', () => {
    setup();
    for (const t of ['Himno Nacional', 'Números romanos', 'Long O (o, oa, ow)']) fireEvent.click(checkbox(t));
    expect((screen.getByRole('button', { name: 'Añadir 0 tareas' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('No hay nada marcado para añadir. Marca una actividad o pulsa Cancelar.')).toBeTruthy();
  });

  it('un título vacío avisa junto al campo y no envía nada', () => {
    const { importAgenda } = setup();
    fireEvent.change(screen.getByRole('textbox', { name: 'Título: Himno Nacional' }), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Añadir 3 tareas' }));
    expect(screen.getByText('Escribe el título')).toBeTruthy();
    expect(importAgenda).not.toHaveBeenCalled();
  });

  it('si el servidor rechaza, lo dice y deja todo como estaba', async () => {
    const { onDone } = setup({ importAgenda: vi.fn(async () => Promise.reject(new ApiError('Datos inválidos', 400, { 'tasks.0.title': 'Escribe el título' }))) });
    fireEvent.click(screen.getByRole('button', { name: 'Añadir 3 tareas' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
    expect(checkbox('Himno Nacional').checked).toBe(true);
  });

  it('sin conexión, pide intentarlo otra vez', async () => {
    setup({ importAgenda: vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))) });
    fireEvent.click(screen.getByRole('button', { name: 'Añadir 3 tareas' }));
    expect(await screen.findByText(/No se pudo guardar/)).toBeTruthy();
  });

  it('Cancelar no añade nada', () => {
    const { onCancel, importAgenda } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalled();
    expect(importAgenda).not.toHaveBeenCalled();
  });
});

describe('importSummary', () => {
  it('cuenta lo que pasó en una frase', () => {
    expect(importSummary({ added: 9, updated: 1, unchanged: 0, skipped: 0 })).toBe('Listo: 9 tareas nuevas y 1 actualizada.');
    expect(importSummary({ added: 1, updated: 0, unchanged: 2, skipped: 1 })).toBe('Listo: 1 tarea nueva, 2 ya estaban y 1 que quitaste no se volvió a añadir.');
    expect(importSummary({ added: 0, updated: 0, unchanged: 3, skipped: 0 })).toBe('No había nada nuevo: 3 ya estaban.');
  });
});

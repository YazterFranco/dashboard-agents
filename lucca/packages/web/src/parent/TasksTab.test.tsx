// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Task } from '@lucca/shared';
import { task } from '../testFixtures';
import { ApiError, type ParentApi } from './api';
import { TasksTab } from './TasksTab';

afterEach(cleanup);

/** Miércoles 18 de noviembre de 2026: la semana va del lunes 16 al viernes 20. */
const TODAY = '2026-11-18';

function setup(tasks: Task[], over: Record<string, unknown> = {}) {
  const api = {
    patchTask: vi.fn(async () => ({})),
    deleteTask: vi.fn(async () => ({ result: 'removed' })),
    createTask: vi.fn(async () => ({})),
    ...over,
  } as unknown as ParentApi;
  const onChanged = vi.fn();
  render(<TasksTab tasks={tasks} today={TODAY} onChanged={onChanged} api={api} />);
  const spy = (name: 'patchTask' | 'deleteTask' | 'createTask') => api[name] as unknown as ReturnType<typeof vi.fn>;
  return { api, onChanged, patch: spy('patchTask'), del: spy('deleteTask'), create: spy('createTask') };
}

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const group = (name: string) => within(screen.getByRole('region', { name }));

const week = [
  task({ id: 'tue-sci', title: 'Las partes de la planta', subject: 'science', assignedDate: '2026-11-17', dueDate: '2026-11-18', status: 'doing' }),
  task({ id: 'wed-eng', title: 'Lectura: My Pet', subject: 'english', assignedDate: '2026-11-18', dueDate: '2026-11-19', source: 'mereb' }),
  task({ id: 'mon-math', title: 'Sumas con llevadas', assignedDate: '2026-11-16', dueDate: '2026-11-17', status: 'done' }),
];

describe('TasksTab positive', () => {
  it('shows the week range and groups the tasks by working day, with the weekday first', () => {
    setup(week);
    expect(screen.getByText('16 – 20 de noviembre')).toBeTruthy();
    expect(group('Lunes 16').getByText('Sumas con llevadas')).toBeTruthy();
    expect(group('Martes 17').getByText('Las partes de la planta')).toBeTruthy();
    expect(group('Miércoles 18').getByText('Lectura: My Pet')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Jueves 19' })).toBeNull();
  });

  it('shows the status, the origin and the due day of each task', () => {
    setup(week);
    const wed = group('Miércoles 18');
    expect(wed.getByText('Por hacer')).toBeTruthy();
    expect(wed.getByText('Mereb')).toBeTruthy();
    expect(wed.getByText('Entregar: jue 19')).toBeTruthy();
    expect(group('Lunes 16').getByText('Lista')).toBeTruthy();
    expect(group('Martes 17').getByText('Haciendo')).toBeTruthy();
    expect(group('Martes 17').getByText('Manual')).toBeTruthy();
  });

  it('"Marcar lista" marks it done and asks for fresh data', async () => {
    const { patch, onChanged } = setup(week);
    click('Marcar lista: Las partes de la planta');
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(patch).toHaveBeenCalledWith('tue-sci', { status: 'done' });
  });

  it('a done task offers "Marcar por hacer"', async () => {
    const { patch, onChanged } = setup(week);
    click('Marcar por hacer: Sumas con llevadas');
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(patch).toHaveBeenCalledWith('mon-math', { status: 'todo' });
  });

  it('hides a task and shows it again', async () => {
    const { patch, onChanged } = setup([...week.slice(0, 1), task({ id: 'x', title: 'Escondida', assignedDate: '2026-11-18', hidden: true })]);
    click('Ocultar: Las partes de la planta');
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(patch).toHaveBeenCalledWith('tue-sci', { hidden: true });
    click('Mostrar: Escondida');
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(2));
    expect(patch).toHaveBeenLastCalledWith('x', { hidden: false });
  });

  it('moves a task to another day', async () => {
    const { patch, onChanged } = setup([task({ id: 'a', title: 'Mover esta', assignedDate: '2026-11-17', dueDate: '2026-11-20' })]);
    fireEvent.change(screen.getByLabelText('Mover a otro día: Mover esta'), { target: { value: '2026-11-19' } });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(patch).toHaveBeenCalledWith('a', { assignedDate: '2026-11-19' });
  });

  it('moving past the due day moves the due day with it', async () => {
    const { patch } = setup([task({ id: 'a', title: 'Mover esta', assignedDate: '2026-11-17', dueDate: '2026-11-18' })]);
    fireEvent.change(screen.getByLabelText('Mover a otro día: Mover esta'), { target: { value: '2026-11-19' } });
    await waitFor(() => expect(patch).toHaveBeenCalled());
    expect(patch).toHaveBeenCalledWith('a', { assignedDate: '2026-11-19', dueDate: '2026-11-19' });
  });

  it('choosing the day it already has does nothing', () => {
    const { patch } = setup([task({ id: 'a', title: 'Mover esta', assignedDate: '2026-11-17' })]);
    fireEvent.change(screen.getByLabelText('Mover a otro día: Mover esta'), { target: { value: '2026-11-17' } });
    expect(patch).not.toHaveBeenCalled();
  });

  it('deleting asks first, then removes a manual task and says so', async () => {
    const { del, onChanged } = setup(week);
    click('Borrar: Las partes de la planta');
    expect(screen.getByText(/Se borrará del todo/)).toBeTruthy();
    expect(del).not.toHaveBeenCalled();
    click('Sí, borrar');
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(del).toHaveBeenCalledWith('tue-sci');
  });

  it('a task that came from Mereb is retired: the confirmation says it will not come back', () => {
    setup(week);
    click('Borrar: Lectura: My Pet');
    expect(screen.getByText(/se retirará y no volverá a aparecer/)).toBeTruthy();
  });

  it('creates a task for the day being viewed and asks for fresh data', async () => {
    const { create, onChanged } = setup([]);
    click('Nueva tarea');
    fireEvent.change(screen.getByLabelText('Materia'), { target: { value: 'science' } });
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Traer una hoja del jardín' } });
    click('Guardar tarea');
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith({ subject: 'science', title: 'Traer una hoja del jardín', description: '', assignedDate: TODAY, dueDate: null });
    expect(screen.queryByRole('heading', { name: 'Nueva tarea' })).toBeNull();
  });

  it('edits a task with its values already filled in', async () => {
    const { patch, onChanged } = setup(week);
    click('Editar: Lectura: My Pet');
    expect((screen.getByLabelText('Título') as HTMLInputElement).value).toBe('Lectura: My Pet');
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Lectura: My Dog' } });
    click('Guardar tarea');
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(patch).toHaveBeenCalledWith('wed-eng', expect.objectContaining({ title: 'Lectura: My Dog', subject: 'english', assignedDate: '2026-11-18' }));
  });
});

describe('TasksTab negative', () => {
  it('cancelling the deletion calls nothing and removes the question', () => {
    const { del, onChanged } = setup(week);
    click('Borrar: Las partes de la planta');
    click('Cancelar');
    expect(del).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.queryByText('Sí, borrar')).toBeNull();
    expect(screen.getByRole('button', { name: 'Borrar: Las partes de la planta' })).toBeTruthy();
  });

  it('only one deletion question is open at a time', () => {
    setup(week);
    click('Borrar: Las partes de la planta');
    click('Borrar: Lectura: My Pet');
    expect(screen.getAllByRole('button', { name: 'Sí, borrar' })).toHaveLength(1);
  });

  it('a server error shows its message next to the task and keeps the state', async () => {
    const { onChanged } = setup(week, { patchTask: vi.fn(async () => Promise.reject(new ApiError('Datos inválidos', 400, { dueDate: 'La entrega no puede ser antes del día asignado' }))) });
    fireEvent.change(screen.getByLabelText('Mover a otro día: Las partes de la planta'), { target: { value: '2026-11-20' } });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('La entrega no puede ser antes del día asignado');
    expect(group('Martes 17').getByText('Las partes de la planta')).toBeTruthy();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('a task that no longer exists says so and refreshes the list', async () => {
    const { onChanged } = setup(week, { patchTask: vi.fn(async () => Promise.reject(new ApiError('Tarea no encontrada', 404))) });
    click('Marcar lista: Las partes de la planta');
    expect((await screen.findByRole('alert')).textContent).toBe('Tarea no encontrada');
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('a lost connection shows a friendly message', async () => {
    setup(week, { deleteTask: vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))) });
    click('Borrar: Las partes de la planta');
    click('Sí, borrar');
    expect((await screen.findByRole('alert')).textContent).toBe('No se pudo guardar. Revisa que el asistente siga encendido e inténtalo otra vez.');
    expect(document.body.textContent).not.toMatch(/failed to fetch/i);
  });

  it('an expired session (401) shows no message: the screen goes back to the PIN by itself', async () => {
    const patchTask = vi.fn(async () => Promise.reject(new ApiError('Hace falta el PIN', 401)));
    setup(week, { patchTask });
    click('Marcar lista: Las partes de la planta');
    await waitFor(() => expect(patchTask).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('the action buttons are disabled while one is in flight, so a double click sends once', async () => {
    let finish!: () => void;
    const { patch } = setup(week, { patchTask: vi.fn(() => new Promise((r) => (finish = () => r({})))) });
    click('Marcar lista: Las partes de la planta');
    click('Marcar lista: Las partes de la planta');
    expect(patch).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('button', { name: 'Marcar lista: Las partes de la planta' }) as HTMLButtonElement).disabled).toBe(true);
    finish();
    await waitFor(() => expect((screen.getByRole('button', { name: 'Marcar lista: Las partes de la planta' }) as HTMLButtonElement).disabled).toBe(false));
  });
});

describe('TasksTab edge', () => {
  it('the week buttons stop one week before and one after this week', () => {
    setup(week);
    const prev = () => screen.getByRole('button', { name: 'Semana anterior' }) as HTMLButtonElement;
    const next = () => screen.getByRole('button', { name: 'Semana siguiente' }) as HTMLButtonElement;
    expect(screen.getByText('Esta semana')).toBeTruthy();
    expect(prev().disabled).toBe(false);
    click('Semana anterior');
    expect(screen.getByText('9 – 13 de noviembre')).toBeTruthy();
    expect(prev().disabled).toBe(true);
    click('Semana siguiente');
    click('Semana siguiente');
    expect(screen.getByText('23 – 27 de noviembre')).toBeTruthy();
    expect(next().disabled).toBe(true);
    click('Esta semana');
    expect(screen.getByText('16 – 20 de noviembre')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Esta semana' })).toBeNull();
  });

  it('an empty week says so and still offers to create a task, for that week', async () => {
    const { create } = setup(week);
    click('Semana siguiente');
    expect(screen.getByText('No hay tareas esta semana')).toBeTruthy();
    click('Nueva tarea');
    expect((screen.getByLabelText('Día asignado') as HTMLInputElement).value).toBe('2026-11-23');
    fireEvent.change(screen.getByLabelText('Materia'), { target: { value: 'math' } });
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Algo' } });
    click('Guardar tarea');
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][0].assignedDate).toBe('2026-11-23');
  });

  it('a task without dates goes under "Sin fecha", only in this week', () => {
    setup([task({ id: 'n', title: 'Sin día' })]);
    expect(group('Sin fecha').getByText('Sin día')).toBeTruthy();
    click('Semana siguiente');
    expect(screen.queryByRole('region', { name: 'Sin fecha' })).toBeNull();
  });

  it('a task with only a due day sits on the school day before it, and one on a weekend has its own group', () => {
    setup([
      task({ id: 'd', title: 'Solo entrega', dueDate: '2026-11-23' }),
      task({ id: 's', title: 'Del sábado', assignedDate: '2026-11-21' }),
    ]);
    expect(group('Viernes 20').getByText('Solo entrega')).toBeTruthy();
    expect(group('Fin de semana').getByText('Del sábado')).toBeTruthy();
  });

  it('an unfinished task from earlier in the week stays on its own day (no carry-over in papá view)', () => {
    setup([task({ id: 'o', title: 'Atrasada', assignedDate: '2026-11-16', dueDate: '2026-11-17' })]);
    expect(group('Lunes 16').getByText('Atrasada')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Miércoles 18' })).toBeNull();
  });

  it('retired tasks are not listed; hidden ones are, marked "Oculta"', () => {
    setup([task({ id: 'r', title: 'Retirada', assignedDate: '2026-11-17', retired: true }), task({ id: 'h', title: 'Escondida', assignedDate: '2026-11-17', hidden: true })]);
    expect(screen.queryByText('Retirada')).toBeNull();
    const tue = group('Martes 17');
    expect(tue.getByText('Escondida')).toBeTruthy();
    expect(tue.getByText('Oculta')).toBeTruthy();
    expect(tue.getByRole('button', { name: 'Mostrar: Escondida' })).toBeTruthy();
  });

  it('a 200-character title is shown whole, wrapped, and as plain text even with markup', () => {
    const long = '<b>x</b>'.repeat(25);
    expect(long).toHaveLength(200);
    const { } = setup([task({ id: 'l', title: long, assignedDate: '2026-11-17' })]);
    const el = screen.getByText(long);
    expect(el.className).toContain('p-task-title');
    expect(document.querySelector('.p-task-title b')).toBeNull();
    expect(el.textContent).toBe(long);
  });

  it('30 tasks render', () => {
    const many = Array.from({ length: 30 }, (_, i) => task({ id: `m${i}`, title: `Tarea número ${i}`, assignedDate: '2026-11-17' }));
    setup(many);
    expect(screen.getAllByRole('button', { name: /^Marcar lista: / })).toHaveLength(30);
  });

  it('Escape closes the deletion question', () => {
    setup(week);
    click('Borrar: Las partes de la planta');
    fireEvent.keyDown(screen.getByRole('button', { name: 'Sí, borrar' }), { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Sí, borrar' })).toBeNull();
  });

  it('opening the form for another task replaces the one that was open', () => {
    setup(week);
    click('Editar: Las partes de la planta');
    click('Editar: Lectura: My Pet');
    expect(screen.getAllByRole('heading', { name: 'Editar tarea' })).toHaveLength(1);
    expect((screen.getByLabelText('Título') as HTMLInputElement).value).toBe('Lectura: My Pet');
  });
});

describe('TasksTab keyboard focus', () => {
  const focusedName = () => (document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent || '').trim();

  it('after saving a new task the focus goes back to "Nueva tarea"', async () => {
    const { onChanged } = setup([]);
    click('Nueva tarea');
    fireEvent.change(screen.getByLabelText('Materia'), { target: { value: 'math' } });
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Algo' } });
    click('Guardar tarea');
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    await waitFor(() => expect(focusedName()).toBe('Nueva tarea'));
  });

  it('cancelling the new-task form puts the focus back on "Nueva tarea"', () => {
    setup(week);
    click('Nueva tarea');
    click('Cancelar');
    expect(focusedName()).toBe('Nueva tarea');
  });

  it('Escape closes the form and also returns the focus', () => {
    setup(week);
    click('Nueva tarea');
    fireEvent.keyDown(screen.getByLabelText('Título'), { key: 'Escape' });
    expect(screen.queryByRole('heading', { name: 'Nueva tarea' })).toBeNull();
    expect(focusedName()).toBe('Nueva tarea');
  });

  it('closing the edit form returns the focus to that task\'s "Editar" button', () => {
    setup(week);
    click('Editar: Lectura: My Pet');
    click('Cancelar');
    expect(focusedName()).toBe('Editar: Lectura: My Pet');
  });

  it('when the deletion question opens the focus goes to the safe choice, "Cancelar"; cancelling returns it to "Borrar"', () => {
    setup(week);
    click('Borrar: Las partes de la planta');
    expect(focusedName()).toBe('Cancelar');
    click('Cancelar');
    expect(focusedName()).toBe('Borrar: Las partes de la planta');
  });

  it('Escape on the deletion question also returns the focus to "Borrar"', () => {
    setup(week);
    click('Borrar: Las partes de la planta');
    fireEvent.keyDown(screen.getByRole('button', { name: 'Sí, borrar' }), { key: 'Escape' });
    expect(focusedName()).toBe('Borrar: Las partes de la planta');
  });

  it('after deleting a task (its row disappears) the focus goes to "Nueva tarea", not to nowhere', async () => {
    const { onChanged } = setup(week);
    click('Borrar: Las partes de la planta');
    click('Sí, borrar');
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(focusedName()).toBe('Nueva tarea');
  });
});

describe('TasksTab lesson preview', () => {
  it('"Ver lección" asks to preview that task', () => {
    const onPreview = vi.fn();
    render(<TasksTab tasks={week} today={TODAY} onChanged={vi.fn()} api={{} as ParentApi} onPreview={onPreview} />);
    click('Ver lección: Las partes de la planta');
    expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({ id: 'tue-sci' }));
  });
  it('without a preview handler there is no button', () => {
    setup(week);
    expect(screen.queryByRole('button', { name: /^Ver lección/ })).toBeNull();
  });
});


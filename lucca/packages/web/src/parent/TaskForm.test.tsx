// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { task } from '../testFixtures';
import { ApiError } from './api';
import { TaskForm } from './TaskForm';

afterEach(cleanup);

type Values = Parameters<ComponentProps['onSubmit']>[0];
type ComponentProps = React.ComponentProps<typeof TaskForm>;

function setup(props: Partial<ComponentProps> = {}) {
  const onSubmit = vi.fn(props.onSubmit ?? (async (_v: Values) => {}));
  const onCancel = vi.fn();
  render(<TaskForm defaultDate="2026-11-18" {...props} onSubmit={onSubmit} onCancel={onCancel} />);
  return { onSubmit, onCancel };
}
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Guardar tarea' }));
function fill(over: Partial<Record<'subject' | 'title' | 'titleEn' | 'assigned' | 'due' | 'description', string>> = {}) {
  type('Materia', over.subject ?? 'science');
  type('Título', over.title ?? 'Traer una hoja del jardín');
  if (over.titleEn !== undefined) type('Título en inglés', over.titleEn);
  if (over.assigned !== undefined) type('Día asignado', over.assigned);
  if (over.due !== undefined) type('Entrega', over.due);
  if (over.description !== undefined) type('Descripción', over.description);
}
const errorOf = (label: string) => {
  const field = screen.getByLabelText(label);
  const id = field.getAttribute('aria-describedby')?.split(' ').find((d) => d.endsWith('-error'));
  return id ? document.getElementById(id) : null;
};

describe('TaskForm positive', () => {
  it('sends the values trimmed, with the default day', async () => {
    const { onSubmit } = setup();
    fill({ title: '   Traer una hoja del jardín  ', titleEn: ' Bring a leaf ', description: '  En una bolsa ' });
    save();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      subject: 'science',
      title: 'Traer una hoja del jardín',
      titleEn: 'Bring a leaf',
      description: 'En una bolsa',
      assignedDate: '2026-11-18',
      dueDate: null,
    });
  });

  it('every field has a visible label', () => {
    setup();
    for (const label of ['Materia', 'Título', 'Título en inglés', 'Día asignado', 'Entrega', 'Descripción']) expect(screen.getByLabelText(label)).toBeTruthy();
  });

  it('starts with no subject chosen, the default day and an empty due day', () => {
    setup();
    expect((screen.getByLabelText('Materia') as HTMLSelectElement).value).toBe('');
    expect((screen.getByLabelText('Día asignado') as HTMLInputElement).value).toBe('2026-11-18');
    expect((screen.getByLabelText('Entrega') as HTMLInputElement).value).toBe('');
  });

  it('when editing, the fields come filled in and a heading says so', () => {
    setup({ initial: task({ id: 'a', subject: 'english', title: 'My Pet', titleTranslations: { en: 'My Pet!' }, description: 'Página 4', assignedDate: '2026-11-17', dueDate: '2026-11-19' }) });
    expect(screen.getByRole('heading', { name: 'Editar tarea' })).toBeTruthy();
    expect((screen.getByLabelText('Materia') as HTMLSelectElement).value).toBe('english');
    expect((screen.getByLabelText('Título') as HTMLInputElement).value).toBe('My Pet');
    expect((screen.getByLabelText('Título en inglés') as HTMLInputElement).value).toBe('My Pet!');
    expect((screen.getByLabelText('Descripción') as HTMLTextAreaElement).value).toBe('Página 4');
    expect((screen.getByLabelText('Día asignado') as HTMLInputElement).value).toBe('2026-11-17');
    expect((screen.getByLabelText('Entrega') as HTMLInputElement).value).toBe('2026-11-19');
  });

  it('puts the focus on the title when it opens', () => {
    setup();
    expect(document.activeElement).toBe(screen.getByLabelText('Título'));
  });
});

describe('TaskForm negative', () => {
  it.each([
    ['an empty title', { title: '' }, 'Título', 'Escribe el título'],
    ['a title of spaces', { title: '    ' }, 'Título', 'Escribe el título'],
    ['a title of 201 characters', { title: 'a'.repeat(201) }, 'Título', 'El título puede tener hasta 200 caracteres'],
    ['no subject', { subject: '' }, 'Materia', 'Elige la materia'],
    ['an English title of 201 characters', { titleEn: 'a'.repeat(201) }, 'Título en inglés', 'El título en inglés puede tener hasta 200 caracteres'],
    ['a description of 2001 characters', { description: 'a'.repeat(2001) }, 'Descripción', 'La descripción puede tener hasta 2000 caracteres'],
    ['a due day before the assigned day', { assigned: '2026-11-19', due: '2026-11-18' }, 'Entrega', 'La entrega no puede ser antes del día asignado'],
  ])('%s shows the reason next to the field, sends nothing and puts the focus there', (_n, over, label, message) => {
    const { onSubmit } = setup();
    fill(over);
    save();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(errorOf(label)!.textContent).toBe(message);
    expect(screen.getByLabelText(label).getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(screen.getByLabelText(label));
  });

  it('focuses the first invalid field in form order', () => {
    setup();
    save();
    expect(document.activeElement).toBe(screen.getByLabelText('Materia'));
  });

  it('shows the errors the server reports, by field', async () => {
    setup({ onSubmit: async () => Promise.reject(new ApiError('Datos inválidos', 400, { title: 'Ese título no sirve' })) });
    fill();
    save();
    await waitFor(() => expect(errorOf('Título')!.textContent).toBe('Ese título no sirve'));
  });

  it('shows a general message when the server fails without fields', async () => {
    setup({ onSubmit: async () => Promise.reject(new ApiError('boom', 500)) });
    fill();
    save();
    expect((await screen.findByRole('alert')).textContent).toBe('Algo salió mal. Inténtalo otra vez en un momento.');
  });

  it('says it could not save when the network fails, and keeps what was typed', async () => {
    setup({ onSubmit: async () => Promise.reject(new TypeError('Failed to fetch')) });
    fill({ title: 'Mi título' });
    save();
    expect((await screen.findByRole('alert')).textContent).toBe('No se pudo guardar. Revisa que el asistente siga encendido e inténtalo otra vez.');
    expect((screen.getByLabelText('Título') as HTMLInputElement).value).toBe('Mi título');
  });

  it('cancel closes without sending', () => {
    const { onSubmit, onCancel } = setup();
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('TaskForm edge', () => {
  it('a title of exactly 200 characters is accepted', async () => {
    const { onSubmit } = setup();
    fill({ title: 'a'.repeat(200) });
    save();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].title).toHaveLength(200);
  });

  it('a description of exactly 2000 characters is accepted', async () => {
    const { onSubmit } = setup();
    fill({ description: 'a'.repeat(2000) });
    save();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  });

  it('an empty English title is not sent when creating', async () => {
    const { onSubmit } = setup();
    fill();
    save();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect('titleEn' in onSubmit.mock.calls[0][0]).toBe(false);
  });

  it('clearing an English title that existed sends it empty, so the server removes it', async () => {
    const { onSubmit } = setup({ initial: task({ id: 'a', subject: 'math', title: 'Sumas', titleTranslations: { en: 'Sums' }, assignedDate: '2026-11-17' }) });
    type('Título en inglés', '');
    save();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].titleEn).toBe('');
  });

  it('a task with no due day sends null', async () => {
    const { onSubmit } = setup();
    fill({ due: '' });
    save();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].dueDate).toBeNull();
  });

  it('clearing the assigned day sends null (a task without a day)', async () => {
    const { onSubmit } = setup();
    fill({ assigned: '' });
    save();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].assignedDate).toBeNull();
  });

  it('the same day for assigned and due is valid', async () => {
    const { onSubmit } = setup();
    fill({ assigned: '2026-11-19', due: '2026-11-19' });
    save();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  });

  it('submits with Enter', async () => {
    const { onSubmit } = setup();
    fill();
    fireEvent.submit(screen.getByRole('button', { name: 'Guardar tarea' }).closest('form')!);
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  });

  it('a second click while sending is ignored', async () => {
    let finish!: () => void;
    const { onSubmit } = setup({ onSubmit: () => new Promise<void>((r) => (finish = r)) });
    fill();
    save();
    save();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect((screen.getByRole('button', { name: 'Guardar tarea' }) as HTMLButtonElement).disabled).toBe(false));
  });

  it('checks a field when leaving it and clears the message as soon as it is right', () => {
    setup();
    const title = screen.getByLabelText('Título');
    fireEvent.change(title, { target: { value: 'a'.repeat(201) } });
    expect(errorOf('Título')).toBeNull();
    fireEvent.blur(title);
    expect(errorOf('Título')!.textContent).toBe('El título puede tener hasta 200 caracteres');
    fireEvent.change(title, { target: { value: 'corto' } });
    expect(errorOf('Título')).toBeNull();
  });

  it('does not complain about fields the person has not visited', () => {
    setup();
    fireEvent.blur(screen.getByLabelText('Título'));
    expect(errorOf('Título')!.textContent).toBe('Escribe el título');
    expect(errorOf('Materia')).toBeNull();
  });

  it('changing the assigned day clears an order error once the due day is fine again', () => {
    setup();
    fill({ assigned: '2026-11-19', due: '2026-11-18' });
    save();
    expect(errorOf('Entrega')).not.toBeNull();
    type('Día asignado', '2026-11-17');
    expect(errorOf('Entrega')).toBeNull();
  });

  it('shows the text as typed, never as markup', async () => {
    const { onSubmit } = setup();
    fill({ title: '<script>alert(1)</script>' });
    save();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].title).toBe('<script>alert(1)</script>');
    expect(document.querySelector('script')).toBeNull();
  });
});

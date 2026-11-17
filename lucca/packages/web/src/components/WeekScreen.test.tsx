// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { KidState } from '@lucca/shared';
import type { Prefs } from '../prefs';
import type { Speaker } from '../speaker';
import { demoState, task } from '../testFixtures';
import { WeekScreen } from './WeekScreen';

afterEach(cleanup);

const ES: Prefs = { lang: 'es', voiceMode: 'both', theme: 'dark' };

function fakeSpeaker(): Speaker & { speak: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> } {
  return { available: () => true, speak: vi.fn(), stop: vi.fn(), speaking: false };
}

function setup(opts: { state?: KidState; prefs?: Prefs } = {}) {
  const speaker = fakeSpeaker();
  const onPrefs = vi.fn();
  const onOpenTask = vi.fn();
  const utils = render(
    <WeekScreen state={opts.state ?? demoState()} prefs={opts.prefs ?? ES} speaker={speaker} onPrefs={onPrefs} onOpenTask={onOpenTask} />,
  );
  return { speaker, onPrefs, onOpenTask, ...utils };
}

const day = (name: RegExp) => screen.getByRole('button', { name });

describe('WeekScreen', () => {
  it('opens on today and shows its tasks', () => {
    setup();
    expect(day(/Martes 17/).getAttribute('aria-pressed')).toBe('true');
    expect(day(/Lunes 16/).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('Hoy, martes 17 · Te faltan 3 tareas')).toBeTruthy();
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(screen.getByText('¡Hola, Lucca!')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
  });

  it('marks only the real today with the "Hoy" pill', () => {
    setup();
    expect(screen.getAllByText('Hoy')).toHaveLength(1);
  });

  it('opens on next Monday during the weekend, with no day marked as today', () => {
    setup({ state: demoState({ today: '2026-11-22', weekStart: '2026-11-16' }) });
    expect(day(/Lunes 23/).getAttribute('aria-pressed')).toBe('true');
    // Las 5 tareas sin terminar de la semana pasada ya vencieron: aparecen el lunes como «¡Para hoy!».
    expect(screen.getByText('Lunes 23 · 5 tareas por hacer')).toBeTruthy();
    expect(screen.getAllByText('¡Para hoy!')).toHaveLength(5);
    expect(screen.queryByText('Hoy')).toBeNull();
  });

  it('shows the tasks of another selected day', () => {
    setup();
    fireEvent.click(day(/Miércoles 18/));
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.getByText('Dibujo de mi familia')).toBeTruthy();
    expect(day(/Miércoles 18/).getAttribute('aria-pressed')).toBe('true');
  });

  it('shows the due label on each card', () => {
    setup();
    expect(screen.getAllByText('Entregar: mié 18')).toHaveLength(3);
  });

  it('puts an unfinished overdue task on today as "¡Para hoy!"', () => {
    const state = demoState();
    state.tasks.push(task({ id: 'late', title: 'Tarea atrasada', assignedDate: '2026-11-13', dueDate: '2026-11-16' }));
    setup({ state });
    const card = screen.getByText('Tarea atrasada').closest('article')!;
    expect(within(card).getByText('¡Para hoy!')).toBeTruthy();
  });

  it('shows the free-day message on a day without tasks', () => {
    setup();
    fireEvent.click(day(/Jueves 19/));
    expect(screen.getByText('¡Nada más por hoy! Tiempo de jugar.')).toBeTruthy();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });

  it('switches every visible text to English', () => {
    setup({ prefs: { ...ES, lang: 'en' } });
    expect(screen.getByText('Hi, Lucca!')).toBeTruthy();
    expect(screen.getByText('Today, Tuesday 17 · 3 tasks left')).toBeTruthy();
    expect(screen.getByText('The parts of a plant')).toBeTruthy();
    expect(screen.getByText('My week')).toBeTruthy();
    expect(screen.getAllByText('Due: Wed 18')).toHaveLength(3);
    expect(screen.queryByText('Mi semana')).toBeNull();
    expect(screen.queryByText('Empezar')).toBeNull();
    expect(screen.getByRole('button', { name: /Start: Subtraction, p\. 26/ })).toBeTruthy();
  });

  it('shows a speaker button per card only when the mode includes audio', () => {
    const both = setup();
    expect(screen.getAllByRole('button', { name: /^Escuchar: / })).toHaveLength(3);
    both.unmount();
    setup({ prefs: { ...ES, voiceMode: 'text' } });
    expect(screen.queryAllByRole('button', { name: /^Escuchar: / })).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Escuchar a Nova' })).toBeNull();
  });

  it('labels the speaker buttons in the active language', () => {
    setup({ prefs: { ...ES, lang: 'en' } });
    expect(screen.getAllByRole('button', { name: /^Listen: / })).toHaveLength(3);
  });

  it('opens a task from its primary button', () => {
    const { onOpenTask } = setup();
    fireEvent.click(screen.getByRole('button', { name: /^Empezar: Restas sin llevar/ }));
    expect(onOpenTask).toHaveBeenCalledWith('tue-math');
    fireEvent.click(screen.getByRole('button', { name: /^Seguir: Las partes de la planta/ }));
    expect(onOpenTask).toHaveBeenCalledWith('tue-sci');
  });

  it('uses "Repasar" for finished tasks', () => {
    setup();
    fireEvent.click(day(/Lunes 16/));
    expect(screen.getAllByRole('button', { name: /^Repasar: / })).toHaveLength(2);
  });

  it('exposes the mode, language and theme groups with their pressed state', () => {
    const { onPrefs } = setup();
    const mode = screen.getByRole('group', { name: 'Cómo quiero aprender' });
    expect(within(mode).getByRole('button', { name: 'Ambos' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(mode).getByRole('button', { name: 'Leer' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(within(mode).getByRole('button', { name: 'Leer' }));
    expect(onPrefs).toHaveBeenLastCalledWith({ ...ES, voiceMode: 'text' });

    const lang = screen.getByRole('group', { name: 'Idioma' });
    expect(within(lang).getByRole('button', { name: 'Español' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(lang).getByRole('button', { name: 'English' }));
    expect(onPrefs).toHaveBeenLastCalledWith({ ...ES, lang: 'en' });

    const theme = screen.getByRole('group', { name: 'Tema' });
    fireEvent.click(within(theme).getByRole('button', { name: 'Claro' }));
    expect(onPrefs).toHaveBeenLastCalledWith({ ...ES, theme: 'light' });
  });

  it('shows only a friendly message before the first sync', () => {
    setup({ state: demoState({ tasks: [] }) });
    expect(screen.getByText('Pídele a papá que conecte tu agenda')).toBeTruthy();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('the mascot suggests the task already started, then the first pending one', () => {
    setup();
    expect(screen.getByText('¿Empezamos con Ciencias?')).toBeTruthy();
    fireEvent.click(day(/Miércoles 18/));
    expect(screen.getByText('¿Empezamos con Inglés?')).toBeTruthy();
    fireEvent.click(day(/Lunes 16/));
    expect(screen.getByText('¡Lo hiciste todo! ¡Buen trabajo!')).toBeTruthy();
  });
});

describe('WeekScreen speech', () => {
  it('does not speak by itself before the first touch', () => {
    const { speaker } = setup();
    expect(speaker.speak).not.toHaveBeenCalled();
  });

  it('reads the summary once after the first touch in "both" mode', () => {
    const { speaker, container } = setup();
    fireEvent.pointerDown(container.firstElementChild!);
    expect(speaker.speak).toHaveBeenCalledTimes(1);
    expect(speaker.speak).toHaveBeenCalledWith([{ text: 'Hoy, martes 17. Te faltan 3 tareas. ¿Empezamos con Ciencias?', lang: 'es' }]);
    fireEvent.pointerDown(container.firstElementChild!);
    expect(speaker.speak).toHaveBeenCalledTimes(1);
  });

  it('never speaks by itself in text mode', () => {
    const { speaker, container } = setup({ prefs: { ...ES, voiceMode: 'text' } });
    fireEvent.pointerDown(container.firstElementChild!);
    fireEvent.click(day(/Miércoles 18/));
    expect(speaker.speak).not.toHaveBeenCalled();
  });

  it('reads the new day when a day is chosen after the first touch', () => {
    const { speaker, container } = setup();
    fireEvent.pointerDown(container.firstElementChild!);
    fireEvent.click(day(/Miércoles 18/));
    expect(speaker.speak).toHaveBeenCalledTimes(2);
    expect(speaker.speak).toHaveBeenLastCalledWith([{ text: 'Miércoles 18. 2 tareas por hacer. ¿Empezamos con Inglés?', lang: 'es' }]);
  });

  it('a speaker button reads the subject and the title', () => {
    const { speaker } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Escuchar: Las partes de la planta' }));
    expect(speaker.speak).toHaveBeenLastCalledWith([{ text: 'Ciencias. Las partes de la planta', lang: 'es' }]);
  });
});

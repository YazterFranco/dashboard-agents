// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { KidState } from '@lucca/shared';
import type { Prefs } from '../prefs';
import type { ProgressResult } from '../progress';
import type { Segment, SpeakHandlers, Speaker } from '../speaker';
import { demoState, task } from '../testFixtures';
import { WeekScreen } from './WeekScreen';

afterEach(cleanup);

const ES: Prefs = { lang: 'es', voiceMode: 'both', theme: 'dark' };

type FakeSpeaker = Speaker & { speak: Mock; stop: Mock; finish(): void };

/** Un lector que recuerda si está hablando, como el de verdad. */
function fakeSpeaker(): FakeSpeaker {
  let playing = false;
  const speak = vi.fn((_segments: Segment[], _handlers?: SpeakHandlers) => {
    playing = true;
  });
  const stop = vi.fn(() => {
    playing = false;
  });
  return {
    available: () => true,
    speak,
    stop,
    finish: () => {
      playing = false;
    },
    get speaking() {
      return playing;
    },
  };
}

function setup(opts: { state?: KidState; prefs?: Prefs } = {}) {
  const speaker = fakeSpeaker();
  const onPrefs = vi.fn();
  const onOpenTask = vi.fn();
  const onProgress = vi.fn(async (): Promise<ProgressResult> => ({ ok: true, starsGained: 0 }));
  const utils = render(
    <WeekScreen
      state={opts.state ?? demoState()}
      prefs={opts.prefs ?? ES}
      speaker={speaker}
      onPrefs={onPrefs}
      onOpenTask={onOpenTask}
      onProgress={onProgress}
    />,
  );
  return { speaker, onPrefs, onOpenTask, onProgress, ...utils };
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
    const cards = screen.getAllByRole('article');
    expect(cards.map((c) => within(c).queryAllByRole('button', { name: /^Escuchar: / }).length)).toEqual([1, 1, 1]);
    both.unmount();
    setup({ prefs: { ...ES, voiceMode: 'text' } });
    expect(screen.queryAllByRole('button', { name: /^Escuchar: / })).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Escuchar a Nova' })).toBeNull();
  });

  it('labels the speaker buttons in the active language', () => {
    setup({ prefs: { ...ES, lang: 'en' } });
    const cards = screen.getAllByRole('article');
    expect(cards.map((c) => within(c).queryAllByRole('button', { name: /^Listen: / }).length)).toEqual([1, 1, 1]);
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
    expect(speaker.speak).toHaveBeenCalledWith([{ text: 'Hoy, martes 17. Te faltan 3 tareas. ¿Empezamos con Ciencias?', lang: 'es' }], expect.anything());
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
    expect(speaker.speak).toHaveBeenLastCalledWith([{ text: 'Miércoles 18. 2 tareas por hacer. ¿Empezamos con Inglés?', lang: 'es' }], expect.anything());
  });

  it('a speaker button reads the subject and the title', () => {
    const { speaker } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Escuchar: Las partes de la planta' }));
    expect(speaker.speak).toHaveBeenLastCalledWith([{ text: 'Ciencias. Las partes de la planta', lang: 'es' }], expect.anything());
  });
});

describe('WeekScreen listen buttons toggle', () => {
  const cardButton = () => screen.getByRole('button', { name: 'Escuchar: Las partes de la planta' });

  it('pressing a card speaker again while it plays stops the reading', () => {
    const { speaker } = setup();
    fireEvent.click(cardButton());
    expect(speaker.speak).toHaveBeenCalledTimes(1);
    fireEvent.click(cardButton());
    expect(speaker.stop).toHaveBeenCalledTimes(1);
    expect(speaker.speak).toHaveBeenCalledTimes(1);
  });

  it("Nova's button also stops its own reading", () => {
    const { speaker } = setup();
    const nova = screen.getByRole('button', { name: 'Escuchar a Nova' });
    fireEvent.click(nova);
    fireEvent.click(nova);
    expect(speaker.speak).toHaveBeenCalledTimes(1);
    expect(speaker.stop).toHaveBeenCalledTimes(1);
  });

  it('reads again once the reading has ended', () => {
    const { speaker } = setup();
    fireEvent.click(cardButton());
    const handlers = speaker.speak.mock.calls[0][1] as SpeakHandlers;
    speaker.finish();
    handlers.onEnd?.();
    fireEvent.click(cardButton());
    expect(speaker.speak).toHaveBeenCalledTimes(2);
    expect(speaker.stop).not.toHaveBeenCalled();
  });

  it('another speaker button while one plays starts the new reading', () => {
    const { speaker } = setup();
    fireEvent.click(cardButton());
    fireEvent.click(screen.getByRole('button', { name: 'Escuchar a Nova' }));
    expect(speaker.speak).toHaveBeenCalledTimes(2);
    expect(speaker.stop).not.toHaveBeenCalled();
  });

  it('Nova stops the automatic reading that started after the first touch', () => {
    const { speaker, container } = setup();
    fireEvent.pointerDown(container.firstElementChild!);
    expect(speaker.speak).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Escuchar a Nova' }));
    expect(speaker.stop).toHaveBeenCalledTimes(1);
    expect(speaker.speak).toHaveBeenCalledTimes(1);
  });
});

describe('WeekScreen week selection and summary', () => {
  const nextWeek = () => fireEvent.click(screen.getByRole('button', { name: 'Semana siguiente' }));

  it('shows the range and marks the current week', () => {
    setup();
    expect(screen.getByText('16 – 20 de noviembre')).toBeTruthy();
    expect(screen.getByText('Esta semana')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Esta semana' })).toBeNull();
  });

  it('next week shows Monday 23 to Friday 27 and a way back', () => {
    setup();
    nextWeek();
    expect(screen.getByText('23 – 27 de noviembre')).toBeTruthy();
    expect(day(/Lunes 23/)).toBeTruthy();
    expect(day(/Viernes 27/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Lunes 16/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Esta semana' })).toBeTruthy();
  });

  it('previous week shows Monday 9', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
    expect(screen.getByText('9 – 13 de noviembre')).toBeTruthy();
    expect(day(/Lunes 9/)).toBeTruthy();
  });

  it('"Esta semana" returns to the current week with today selected', () => {
    setup();
    nextWeek();
    fireEvent.click(screen.getByRole('button', { name: 'Esta semana' }));
    expect(day(/Martes 17/).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('16 – 20 de noviembre')).toBeTruthy();
  });

  it('shows a range that crosses the month', () => {
    setup();
    nextWeek();
    nextWeek();
    expect(screen.getByText('30 nov – 4 dic')).toBeTruthy();
    expect(day(/Lunes 30/)).toBeTruthy();
  });

  it('selects the first day with pending tasks in another week', () => {
    const state = demoState();
    state.tasks.push(task({ id: 'thu', title: 'Tarea del jueves', assignedDate: '2026-11-26', dueDate: '2026-11-27' }));
    setup({ state });
    nextWeek();
    expect(day(/Jueves 26/).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Tarea del jueves')).toBeTruthy();
  });

  it('an empty week selects Monday and shows the free-day message', () => {
    setup();
    nextWeek();
    expect(day(/Lunes 23/).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('¡Nada más por hoy! Tiempo de jugar.')).toBeTruthy();
  });

  it('summarises the week with a progress bar', () => {
    setup();
    expect(screen.getByText('2 de 7 tareas listas')).toBeTruthy();
    const bar = screen.getByRole('progressbar', { name: '2 de 7 tareas listas' });
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('7');
    expect(bar.getAttribute('aria-valuenow')).toBe('2');
  });

  it('a week without tasks says so and has no progress bar', () => {
    setup();
    nextWeek();
    expect(screen.getByText('Sin tareas esta semana')).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('past weeks do not show the unfinished overdue tasks, which moved to today', () => {
    const state = demoState();
    state.tasks.push(task({ id: 'old', title: 'Tarea vieja', assignedDate: '2026-11-10', dueDate: '2026-11-11' }));
    setup({ state });
    expect(screen.getByText('Tarea vieja')).toBeTruthy(); // hoy, como «¡Para hoy!»
    fireEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
    fireEvent.click(day(/Martes 10/));
    expect(screen.queryByText('Tarea vieja')).toBeNull();
    expect(screen.getByText('Sin tareas esta semana')).toBeTruthy();
  });

  it('reads the week summary aloud', () => {
    const { speaker } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Escuchar: 2 de 7 tareas listas' }));
    expect(speaker.speak).toHaveBeenLastCalledWith([{ text: '16 – 20 de noviembre. 2 de 7 tareas listas.', lang: 'es' }], expect.anything());
  });

  it('has no weekly speaker button in text mode', () => {
    setup({ prefs: { ...ES, voiceMode: 'text' } });
    expect(screen.queryByRole('button', { name: /^Escuchar: 2 de 7/ })).toBeNull();
  });

  it('works in English', () => {
    setup({ prefs: { ...ES, lang: 'en' } });
    expect(screen.getByText('November 16 – 20')).toBeTruthy();
    expect(screen.getByText('2 of 7 tasks done')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Previous week' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next week' })).toBeTruthy();
    expect(screen.getByText('This week')).toBeTruthy();
  });
});

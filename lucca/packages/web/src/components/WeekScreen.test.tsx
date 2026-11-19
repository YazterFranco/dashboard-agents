// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { KidState, ProgressKind } from '@lucca/shared';
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

function setup(opts: { state?: KidState; prefs?: Prefs; onProgress?: (taskId: string, kind: ProgressKind) => Promise<ProgressResult> } = {}) {
  const speaker = fakeSpeaker();
  const onPrefs = vi.fn();
  const onOpenTask = vi.fn();
  const onProgress = vi.fn(opts.onProgress ?? (async (): Promise<ProgressResult> => ({ ok: true, starsGained: 0 })));
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

describe('WeekScreen week plan', () => {
  const openPlan = () => fireEvent.click(screen.getByRole('button', { name: 'Plan de la semana' }));
  const finishedTuesday = () => {
    const state = demoState();
    state.tasks = state.tasks.map((t) => (t.id.startsWith('tue') ? { ...t, status: 'done' as const } : t));
    return state;
  };

  it('opens the week plan with every school day', () => {
    setup();
    openPlan();
    expect(screen.getByRole('heading', { level: 1, name: 'Plan de la semana' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Ir a / })).toHaveLength(5);
    expect(screen.getByText('16 – 20 de noviembre')).toBeTruthy();
  });

  it('says where to start: today when it has pending tasks', () => {
    setup();
    openPlan();
    expect(screen.getByText('Empieza por hoy')).toBeTruthy();
  });

  it('says where to start: the next day with pending tasks when today is complete', () => {
    setup({ state: finishedTuesday() });
    openPlan();
    expect(screen.getByText('Empieza por el miércoles')).toBeTruthy();
  });

  it('says everything is done when nothing is pending', () => {
    const state = demoState();
    state.tasks = state.tasks.map((t) => ({ ...t, status: 'done' as const }));
    setup({ state });
    openPlan();
    expect(screen.getByText('¡Todo listo esta semana!')).toBeTruthy();
  });

  it('shows each task with its title and status', () => {
    setup();
    openPlan();
    const tuesday = screen.getByRole('button', { name: /^Ir a Martes 17/ });
    expect(within(tuesday).getByText('Las partes de la planta')).toBeTruthy();
    expect(within(tuesday).getByText('A medias')).toBeTruthy();
    expect(within(tuesday).getByText('Restas sin llevar, pág. 26')).toBeTruthy();
    const monday = screen.getByRole('button', { name: /^Ir a Lunes 16/ });
    expect(within(monday).getAllByText('¡Lista!')).toHaveLength(2);
  });

  it('exposes each day with its tasks and their status to assistive technology', () => {
    setup();
    openPlan();
    // Sin depender del orden en que se listan las tareas del día.
    expect(screen.getByRole('button', { name: /^Ir a Martes 17\.(?=.*Las partes de la planta)(?=.*A medias)(?=.*Restas sin llevar, pág\. 26)/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Ir a Lunes 16\.(?=.*Sumas con llevadas, pág\. 24)(?=.*¡Lista!)/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Ir a Jueves 19\..*Día libre/ })).toBeTruthy();
  });

  it('marks today in the plan and no other day', () => {
    setup();
    openPlan();
    expect(within(screen.getByRole('button', { name: /^Ir a Martes 17/ })).getByText('Hoy')).toBeTruthy();
    expect(screen.getAllByText('Hoy')).toHaveLength(1);
  });

  it('shows the weekly progress inside the plan', () => {
    setup();
    openPlan();
    expect(screen.getByRole('progressbar', { name: '2 de 7 tareas listas' })).toBeTruthy();
  });

  it('marks the days without tasks', () => {
    setup();
    openPlan();
    expect(within(screen.getByRole('button', { name: /^Ir a Jueves 19/ })).getByText('Día libre')).toBeTruthy();
  });

  it('tapping a day goes back to the week with that day selected', () => {
    setup();
    openPlan();
    fireEvent.click(screen.getByRole('button', { name: /^Ir a Miércoles 18/ }));
    expect(screen.getByRole('heading', { level: 2, name: 'Mi semana' })).toBeTruthy();
    expect(day(/Miércoles 18/).getAttribute('aria-pressed')).toBe('true');
  });

  it('back returns to the week with the same day selected and the focus on the button that opened it', () => {
    setup();
    fireEvent.click(day(/Miércoles 18/));
    openPlan();
    fireEvent.click(screen.getByRole('button', { name: 'Volver a mi semana' }));
    expect(day(/Miércoles 18/).getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Plan de la semana' }));
  });

  it('moves the focus to the heading when the plan opens', () => {
    setup();
    openPlan();
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Plan de la semana' }));
  });

  it('shows the plan of the week being viewed', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Semana siguiente' }));
    openPlan();
    expect(screen.getByText('23 – 27 de noviembre')).toBeTruthy();
    expect(screen.getAllByText('Sin tareas esta semana').length).toBeGreaterThan(0);
  });

  it('works in English', () => {
    setup({ prefs: { ...ES, lang: 'en' } });
    fireEvent.click(screen.getByRole('button', { name: 'Week plan' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Week plan' })).toBeTruthy();
    expect(screen.getByText('Start with today')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Go to Tuesday 17/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to my week' })).toBeTruthy();
  });
});

describe('WeekScreen day guide', () => {
  const guideMe = () => fireEvent.click(screen.getByRole('button', { name: 'Guíame' }));
  const title = () => screen.getByRole('heading', { level: 1 }).textContent;
  const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
  /** Pulsa y deja que React procese lo que pasa después de la respuesta (act espera las promesas). */
  const clickAndWait = async (name: string) => {
    await act(async () => {
      click(name);
    });
  };

  it('opens the guide with the started task first', () => {
    setup();
    guideMe();
    expect(screen.getByText('Tarea 1 de 3')).toBeTruthy();
    expect(title()).toBe('Las partes de la planta');
    expect(screen.getByText('Ciencias')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: '¡Hola, Lucca!' })).toBeNull();
  });

  it('"¡Ya la hice!" sends task_done and moves to the next task', async () => {
    const { onProgress } = setup();
    guideMe();
    await clickAndWait('¡Ya la hice!');
    expect(onProgress).toHaveBeenCalledWith('tue-sci', 'task_done');
    expect(screen.getByText('Tarea 2 de 3')).toBeTruthy();
    expect(title()).toBe('Restas sin llevar, pág. 26');
  });

  it('"Más tarde" sends the task to the end without changing it', () => {
    const { onProgress } = setup();
    guideMe();
    click('Más tarde');
    expect(onProgress).not.toHaveBeenCalled();
    expect(title()).toBe('Restas sin llevar, pág. 26');
    expect(screen.getByText('Tarea 1 de 3')).toBeTruthy();
    click('Más tarde');
    click('Más tarde');
    expect(title()).toBe('Las partes de la planta');
  });

  it('"Más tarde" is disabled for the last task', async () => {
    setup();
    guideMe();
    await clickAndWait('¡Ya la hice!');
    await clickAndWait('¡Ya la hice!');
    expect(title()).toBe('Leer “La semilla mágica” y dibujar el final');
    expect((screen.getByRole('button', { name: 'Más tarde' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('finishing the last task shows the celebration with the stars earned', async () => {
    const answers = [1, 1, 0];
    setup({ onProgress: async () => ({ ok: true, starsGained: answers.shift()! }) });
    guideMe();
    await clickAndWait('¡Ya la hice!');
    await clickAndWait('¡Ya la hice!');
    await clickAndWait('¡Ya la hice!');
    expect(title()).toBe('¡Terminaste el día!');
    expect(screen.getByText('Estrellas ganadas: 2')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Volver a mi semana' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '¡Ya la hice!' })).toBeNull();
  });

  it('a failed send says "Inténtalo otra vez", keeps the task and allows retrying', async () => {
    const results: ProgressResult[] = [{ ok: false }, { ok: true, starsGained: 1 }];
    setup({ onProgress: async () => results.shift()! });
    guideMe();
    await clickAndWait('¡Ya la hice!');
    expect(screen.getByText('Inténtalo otra vez')).toBeTruthy();
    expect(screen.getByText('Tarea 1 de 3')).toBeTruthy();
    expect(title()).toBe('Las partes de la planta');
    expect((screen.getByRole('button', { name: '¡Ya la hice!' }) as HTMLButtonElement).disabled).toBe(false);
    await clickAndWait('¡Ya la hice!');
    expect(screen.queryByText('Inténtalo otra vez')).toBeNull();
    expect(screen.getByText('Tarea 2 de 3')).toBeTruthy();
  });

  it('a double tap sends one event and does not skip a task', async () => {
    let resolve!: (r: ProgressResult) => void;
    const { onProgress } = setup({ onProgress: () => new Promise<ProgressResult>((r) => (resolve = r)) });
    guideMe();
    const button = screen.getByRole('button', { name: '¡Ya la hice!' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onProgress).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve({ ok: true, starsGained: 1 });
    });
    expect(screen.getByText('Tarea 2 de 3')).toBeTruthy();
    expect(title()).toBe('Restas sin llevar, pág. 26');
  });

  it('skips a queued task that is already done or gone', () => {
    const { rerender, speaker, onPrefs, onOpenTask, onProgress } = setup();
    guideMe();
    const changed = demoState();
    changed.tasks = changed.tasks.filter((t) => t.id !== 'tue-math').map((t) => (t.id === 'tue-sci' ? { ...t, status: 'done' as const } : t));
    rerender(<WeekScreen state={changed} prefs={ES} speaker={speaker} onPrefs={onPrefs} onOpenTask={onOpenTask} onProgress={onProgress} />);
    expect(title()).toBe('Leer “La semilla mágica” y dibujar el final');
    expect(screen.getByText('Tarea 3 de 3')).toBeTruthy();
  });

  it('a day with everything done shows the done message instead of an empty guide', () => {
    setup();
    fireEvent.click(day(/Lunes 16/));
    guideMe();
    expect(screen.getByText('¡Lo hiciste todo! ¡Buen trabajo!')).toBeTruthy();
    expect(screen.queryByText(/^Tarea \d/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Volver a mi semana' })).toBeTruthy();
  });

  it('a day without tasks shows the free-day message instead of an empty guide', () => {
    setup();
    fireEvent.click(day(/Jueves 19/));
    guideMe();
    expect(screen.getByText('¡Nada más por hoy! Tiempo de jugar.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '¡Ya la hice!' })).toBeNull();
  });

  it('reads each step aloud in "both" mode', () => {
    const { speaker } = setup();
    guideMe();
    expect(speaker.speak).toHaveBeenLastCalledWith([{ text: 'Tarea 1 de 3. Ciencias. Las partes de la planta.', lang: 'es' }], expect.anything());
    click('Más tarde');
    expect(speaker.speak).toHaveBeenLastCalledWith([{ text: 'Tarea 1 de 3. Matemáticas. Restas sin llevar, pág. 26.', lang: 'es' }], expect.anything());
  });

  it('does not read and has no speaker button in "text" mode', () => {
    const { speaker } = setup({ prefs: { ...ES, voiceMode: 'text' } });
    guideMe();
    expect(speaker.speak).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /^Escuchar: / })).toBeNull();
  });

  it('the speaker button stops a reading in progress and reads again afterwards', () => {
    const { speaker } = setup();
    guideMe();
    expect(speaker.speak).toHaveBeenCalledTimes(1);
    click('Escuchar: Las partes de la planta');
    expect(speaker.stop).toHaveBeenCalledTimes(1);
    click('Escuchar: Las partes de la planta');
    expect(speaker.speak).toHaveBeenCalledTimes(2);
  });

  it('leaving the guide stops the reading', () => {
    const { speaker } = setup();
    guideMe();
    speaker.stop.mockClear();
    click('Volver a mi semana');
    expect(speaker.stop).toHaveBeenCalled();
  });

  it('back returns to the week with the same day selected and the focus on "Guíame"', () => {
    setup();
    fireEvent.click(day(/Miércoles 18/));
    guideMe();
    click('Volver a mi semana');
    expect(day(/Miércoles 18/).getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Guíame' }));
  });

  it('moves the focus to the heading when it opens and when the task changes', () => {
    setup();
    guideMe();
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));
    (document.activeElement as HTMLElement).blur();
    click('Más tarde');
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));
  });

  it('a day of a past week only holds finished tasks, so its guide says everything is done', () => {
    const state = demoState();
    state.tasks.push(task({ id: 'past', title: 'Tarea de la semana pasada', assignedDate: '2026-11-10', dueDate: '2026-11-11', status: 'done' }));
    setup({ state });
    fireEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
    fireEvent.click(day(/Martes 10/));
    expect(screen.getByText('Tarea de la semana pasada')).toBeTruthy();
    guideMe();
    expect(screen.getByText('¡Lo hiciste todo! ¡Buen trabajo!')).toBeTruthy();
  });

  it('works in English', () => {
    setup({ prefs: { ...ES, lang: 'en' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guide me' }));
    expect(screen.getByText('Task 1 of 3')).toBeTruthy();
    expect(title()).toBe('The parts of a plant');
    expect(screen.getByRole('button', { name: 'I did it!' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Later' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to my week' })).toBeTruthy();
  });
});

describe('WeekScreen carry-over of unfinished tasks', () => {
  it('shows an unfinished task from an earlier day today, without "¡Para hoy!", and counts it', () => {
    const state = demoState();
    state.tasks.push(task({ id: 'carry', title: 'Tarea pendiente de antes', assignedDate: '2026-11-10', dueDate: '2026-11-27' }));
    setup({ state });
    const card = screen.getByText('Tarea pendiente de antes').closest('article')!;
    expect(within(card).queryByText('¡Para hoy!')).toBeNull();
    expect(screen.getByText('2 de 8 tareas listas')).toBeTruthy();
    expect(screen.getByText('Hoy, martes 17 · Te faltan 4 tareas')).toBeTruthy();
  });

  it('the plan does not say everything is done while an earlier task is pending', () => {
    const state = demoState();
    state.tasks = state.tasks.map((t) => ({ ...t, status: 'done' as const }));
    state.tasks.push(task({ id: 'carry', title: 'Tarea pendiente de antes', assignedDate: '2026-11-10' }));
    setup({ state });
    fireEvent.click(screen.getByRole('button', { name: 'Plan de la semana' }));
    expect(screen.queryByText('¡Todo listo esta semana!')).toBeNull();
    expect(screen.getByText('Empieza por hoy')).toBeTruthy();
  });

  it('the guide of today offers the carried-over task', () => {
    const state = demoState();
    state.tasks.push(task({ id: 'carry', title: 'Tarea pendiente de antes', assignedDate: '2026-11-10' }));
    setup({ state });
    fireEvent.click(screen.getByRole('button', { name: 'Guíame' }));
    expect(screen.getByText('Tarea 1 de 4')).toBeTruthy();
  });
});

describe('WeekScreen link to the parents area', () => {
  it('has a link to /papa that is always there', () => {
    setup();
    expect(screen.getByRole('link', { name: 'Área de papá' }).getAttribute('href')).toBe('/papa');
  });

  it('is there in text mode too and in English', () => {
    setup({ prefs: { ...ES, voiceMode: 'text' } });
    expect(screen.getByRole('link', { name: 'Área de papá' })).toBeTruthy();
    cleanup();
    setup({ prefs: { ...ES, lang: 'en' } });
    expect(screen.getByRole('link', { name: "Parents' area" }).getAttribute('href')).toBe('/papa');
  });

  it('is there even before the agenda has any task', () => {
    setup({ state: demoState({ tasks: [] }) });
    expect(screen.getByRole('link', { name: 'Área de papá' })).toBeTruthy();
  });
});

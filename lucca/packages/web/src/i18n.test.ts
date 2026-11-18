import { describe, expect, it } from 'vitest';
import { MESSAGE_KEYS, dayLong, dayShort, dueLabel, summaryLine, t, weekProgressText, weekRange } from './i18n';

describe('i18n', () => {
  it('has every message in Spanish and English', () => {
    for (const key of MESSAGE_KEYS) {
      expect(t('es', key).length, `es:${key}`).toBeGreaterThan(0);
      expect(t('en', key).length, `en:${key}`).toBeGreaterThan(0);
    }
  });

  it('uses the exact texts from the spec', () => {
    expect(t('es', 'freeDay')).toBe('¡Nada más por hoy! Tiempo de jugar.');
    expect(t('es', 'noAgenda')).toBe('Pídele a papá que conecte tu agenda');
    expect(t('es', 'urgent')).toBe('¡Para hoy!');
  });

  it('fills variables', () => {
    expect(t('es', 'hello', { name: 'Lucca' })).toBe('¡Hola, Lucca!');
    expect(t('en', 'hello', { name: 'Lucca' })).toBe('Hi, Lucca!');
    expect(t('es', 'mascotSuggest', { subject: 'Ciencias' })).toBe('¿Empezamos con Ciencias?');
  });

  it('names the days of the week in both languages', () => {
    expect(dayShort('es', 1)).toBe('Lun');
    expect(dayShort('es', 3)).toBe('Mié');
    expect(dayShort('en', 3)).toBe('Wed');
    expect(dayLong('es', 2)).toBe('martes');
    expect(dayLong('en', 2)).toBe('Tuesday');
  });

  it('formats the due label', () => {
    expect(dueLabel('es', '2026-11-18')).toBe('Entregar: mié 18');
    expect(dueLabel('en', '2026-11-18')).toBe('Due: Wed 18');
  });

  it('summarises the day in Spanish', () => {
    expect(summaryLine('es', { isToday: true, date: '2026-11-17', pending: 2 })).toBe('Hoy, martes 17 · Te faltan 2 tareas');
    expect(summaryLine('es', { isToday: true, date: '2026-11-17', pending: 1 })).toBe('Hoy, martes 17 · Te falta 1 tarea');
    expect(summaryLine('es', { isToday: true, date: '2026-11-17', pending: 0 })).toBe('Hoy, martes 17 · ¡Todo listo!');
    expect(summaryLine('es', { isToday: false, date: '2026-11-18', pending: 2 })).toBe('Miércoles 18 · 2 tareas por hacer');
    expect(summaryLine('es', { isToday: false, date: '2026-11-18', pending: 1 })).toBe('Miércoles 18 · 1 tarea por hacer');
  });

  it('summarises the day in English', () => {
    expect(summaryLine('en', { isToday: true, date: '2026-11-17', pending: 2 })).toBe('Today, Tuesday 17 · 2 tasks left');
    expect(summaryLine('en', { isToday: true, date: '2026-11-17', pending: 1 })).toBe('Today, Tuesday 17 · 1 task left');
    expect(summaryLine('en', { isToday: false, date: '2026-11-18', pending: 2 })).toBe('Wednesday 18 · 2 tasks to do');
    expect(summaryLine('en', { isToday: false, date: '2026-11-18', pending: 0 })).toBe('Wednesday 18 · All done!');
  });

  it('does not say "all done" on a day without tasks', () => {
    expect(summaryLine('es', { isToday: false, date: '2026-11-19', pending: 0, total: 0 })).toBe('Jueves 19');
    expect(summaryLine('en', { isToday: true, date: '2026-11-17', pending: 0, total: 0 })).toBe('Today, Tuesday 17');
  });
});

describe('week texts', () => {
  it('formats the Monday to Friday range inside a month', () => {
    expect(weekRange('es', '2026-11-23')).toBe('23 – 27 de noviembre');
    expect(weekRange('en', '2026-11-16')).toBe('November 16 – 20');
  });

  it('formats a range that crosses the month or the year', () => {
    expect(weekRange('es', '2026-11-30')).toBe('30 nov – 4 dic');
    expect(weekRange('en', '2026-11-30')).toBe('Nov 30 – Dec 4');
    expect(weekRange('es', '2026-12-28')).toBe('28 dic – 1 ene');
  });

  it('accepts any day of the week', () => {
    expect(weekRange('es', '2026-11-18')).toBe('16 – 20 de noviembre');
  });

  it('writes the weekly progress with the right plural', () => {
    expect(weekProgressText('es', 5, 10)).toBe('5 de 10 tareas listas');
    expect(weekProgressText('es', 1, 1)).toBe('1 de 1 tarea lista');
    expect(weekProgressText('en', 5, 10)).toBe('5 of 10 tasks done');
    expect(weekProgressText('en', 0, 1)).toBe('0 of 1 task done');
  });

  it('has the exact texts from the spec', () => {
    expect(t('es', 'weekPrev')).toBe('Semana anterior');
    expect(t('es', 'weekNext')).toBe('Semana siguiente');
    expect(t('es', 'thisWeek')).toBe('Esta semana');
    expect(t('es', 'weekNone')).toBe('Sin tareas esta semana');
    expect(t('es', 'planOpen')).toBe('Plan de la semana');
    expect(t('es', 'guideStart')).toBe('Guíame');
    expect(t('es', 'guideDone')).toBe('¡Ya la hice!');
    expect(t('es', 'guideLater')).toBe('Más tarde');
    expect(t('es', 'guideBack')).toBe('Volver a mi semana');
    expect(t('es', 'guideFinished')).toBe('¡Terminaste el día!');
    expect(t('es', 'guideStep', { n: '2', m: '3' })).toBe('Tarea 2 de 3');
    expect(t('es', 'planStartDay', { day: 'miércoles' })).toBe('Empieza por el miércoles');
    expect(t('en', 'planStartDay', { day: 'Wednesday' })).toBe('Start with Wednesday');
  });
});

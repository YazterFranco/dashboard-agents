import { describe, expect, it } from 'vitest';
import { MESSAGE_KEYS, dayLong, dayShort, dueLabel, summaryLine, t } from './i18n';

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

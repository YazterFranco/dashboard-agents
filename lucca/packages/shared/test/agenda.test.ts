import { describe, expect, it } from 'vitest';
import { AgendaImportBodySchema, TaskDraftSchema, mapSubject, prettyLabel } from '../src/agenda.js';

describe('mapSubject: materias de la agenda de Mereb', () => {
  it.each([
    ['CIENCIAS SOCIALES', 'social', 'Ciencias Sociales'],
    ['READING', 'english', 'Reading'],
    ['ESPAÑOL', 'spanish', 'Español'],
    ['SPELLING/PHONICS', 'english', 'Spelling / Phonics'],
    ['MATEMATICAS', 'math', 'Matemáticas'],
    ['WRITING AND GRAMMAR', 'english', 'Writing and Grammar'],
    ['SCIENCE', 'science', 'Science'],
    ['ART AND MUSIC APPRECIATION', 'music', 'Art and Music Appreciation'],
    ['FOLKLORE/ DANZA', 'music', 'Folklore / Danza'],
    ['EDUCACIÓN FÍSICA', 'pe', 'Educación Física'],
    ['RELIGION', 'religion', 'Religión'],
    ['ARTÍSTICA', 'art', 'Artística'],
  ])('%s → %s (%s)', (raw, subject, label) => {
    expect(mapSubject(raw)).toEqual({ subject, label });
  });

  it('una materia desconocida queda como «other» y conserva el nombre', () => {
    expect(mapSubject('ROBÓTICA')).toEqual({ subject: 'other', label: 'Robótica' });
  });

  it('«Ciencias Sociales» no se confunde con Ciencias naturales', () => {
    expect(mapSubject('Ciencias sociales').subject).toBe('social');
    expect(mapSubject('CIENCIAS NATURALES').subject).toBe('science');
  });

  it('un nombre vacío no revienta', () => {
    expect(mapSubject('  ')).toEqual({ subject: 'other', label: 'Otra' });
  });
});

describe('prettyLabel', () => {
  it('pone mayúsculas de título y respeta palabras cortas', () => {
    expect(prettyLabel('EVALUACIÓN ORAL - 1')).toBe('Evaluación Oral 1');
    expect(prettyLabel('LA BANDERA DE PANAMA')).toBe('La Bandera de Panamá');
  });
  it('deja tal cual lo que ya viene con mayúsculas y minúsculas', () => {
    expect(prettyLabel('Baile Folclórico ')).toBe('Baile Folclórico');
  });
});

const draft = {
  key: '2026-11-23-matematicas-1a2b3c4d',
  subject: 'math',
  subjectLabel: 'Matemáticas',
  title: 'Números romanos',
  description: 'Ejercicio 3',
  dueDate: '2026-11-25',
  kind: 'Ejercicio 3',
};

describe('TaskDraftSchema / AgendaImportBodySchema', () => {
  it('acepta una tarea propuesta válida', () => {
    expect(TaskDraftSchema.parse(draft)).toEqual(draft);
  });

  it('rechaza claves con caracteres raros (la clave forma el id de la tarea)', () => {
    expect(TaskDraftSchema.safeParse({ ...draft, key: '../../x' }).success).toBe(false);
    expect(TaskDraftSchema.safeParse({ ...draft, key: '' }).success).toBe(false);
  });

  it('rechaza fechas inexistentes y títulos vacíos', () => {
    expect(TaskDraftSchema.safeParse({ ...draft, dueDate: '2026-02-30' }).success).toBe(false);
    expect(TaskDraftSchema.safeParse({ ...draft, title: '   ' }).success).toBe(false);
  });

  it('pide al menos una tarea y como mucho 60', () => {
    expect(AgendaImportBodySchema.safeParse({ tasks: [] }).success).toBe(false);
    expect(AgendaImportBodySchema.safeParse({ tasks: Array.from({ length: 61 }, () => draft) }).success).toBe(false);
    expect(AgendaImportBodySchema.safeParse({ tasks: [draft] }).success).toBe(true);
  });
});

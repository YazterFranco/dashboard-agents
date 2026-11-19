import { describe, expect, it } from 'vitest';
import { LessonDocSchema, bi, checkLesson, lessonText, sentenceWords, type LessonDoc } from '../src/lesson';

const valid = (): LessonDoc => ({
  title: bi('Las partes de la planta', 'The parts of a plant'),
  screens: [
    { blocks: [{ type: 'explain', text: bi('Una planta tiene partes.', 'A plant has parts.'), emoji: '🌱' }] },
    { blocks: [{ type: 'explain', text: bi('La raíz bebe agua.', 'The root drinks water.'), emoji: '💧' }] },
    { blocks: [{ type: 'count', question: bi('¿Cuántas hojas hay?', 'How many leaves are there?'), emoji: '🍃', amount: 3 }] },
    { blocks: [{ type: 'order', question: bi('Ordena de abajo arriba.', 'Order from bottom to top.'), items: [bi('Raíz', 'Root'), bi('Tallo', 'Stem'), bi('Flor', 'Flower')] }] },
  ],
  quiz: [
    { type: 'choice', question: bi('¿Qué parte bebe agua?', 'Which part drinks water?'), options: [{ text: bi('La raíz', 'The root') }, { text: bi('La flor', 'The flower') }], correct: 0 },
    { type: 'trueFalse', statement: bi('Las hojas comen sol.', 'Leaves eat sunlight.'), answer: true },
  ],
});

describe('bi', () => {
  it('builds a one-segment text per language', () => {
    expect(bi('Hola', 'Hello')).toEqual({ es: [{ text: 'Hola' }], en: [{ text: 'Hello' }] });
  });
  it('lessonText joins the segments of a language', () => {
    expect(lessonText({ es: [{ text: 'Di ' }, { text: 'cat', lang: 'en' }], en: [{ text: 'Say cat' }] }, 'es')).toBe('Di cat');
  });
});

describe('LessonDocSchema', () => {
  it('accepts a valid lesson', () => {
    expect(LessonDocSchema.safeParse(valid()).success).toBe(true);
  });
  it('rejects an unknown block type', () => {
    const doc = valid() as unknown as { screens: { blocks: unknown[] }[] };
    doc.screens[0].blocks[0] = { type: 'video', url: 'x' };
    expect(LessonDocSchema.safeParse(doc).success).toBe(false);
  });
  it('rejects an extra field (the AI cannot smuggle data)', () => {
    const doc = { ...valid(), html: '<script>' };
    expect(LessonDocSchema.safeParse(doc).success).toBe(false);
  });
});

describe('checkLesson (D6)', () => {
  it('a good lesson has no issues', () => {
    expect(checkLesson(valid())).toEqual([]);
  });

  it.each([
    ['3 screens', (d: LessonDoc) => (d.screens = d.screens.slice(0, 3)), /entre 4 y 6 pantallas/],
    ['7 screens', (d: LessonDoc) => (d.screens = [...d.screens, ...d.screens.slice(0, 3)]), /entre 4 y 6 pantallas/],
    ['1 question', (d: LessonDoc) => (d.quiz = d.quiz.slice(0, 1)), /2 o 3 preguntas/],
    ['4 questions', (d: LessonDoc) => (d.quiz = [...d.quiz, ...d.quiz]), /2 o 3 preguntas/],
    ['a long sentence', (d: LessonDoc) => (d.screens[0].blocks[0] = { type: 'explain', text: bi('Una planta es un ser vivo que tiene muchas partes muy distintas entre sí.', 'Short.') }), /más de 12 palabras/],
    ['a URL', (d: LessonDoc) => (d.screens[1].blocks[0] = { type: 'explain', text: bi('Mira www.ejemplo.com ahora.', 'Look.') }), /enlace/],
    ['an empty language', (d: LessonDoc) => (d.title = { es: [{ text: 'Hola' }], en: [] }), /falta el texto en inglés/],
    ['a correct answer out of range', (d: LessonDoc) => ((d.quiz[0] as { correct: number }).correct = 5), /respuesta correcta/],
    ['a count over 20', (d: LessonDoc) => (d.screens[2].blocks[0] = { type: 'count', question: bi('¿Cuántas?', 'How many?'), emoji: '🍃', amount: 25 }), /contar/],
    ['a number line answer outside', (d: LessonDoc) => (d.screens[2].blocks[0] = { type: 'numberLine', question: bi('¿Dónde está el 9?', 'Where is 9?'), min: 0, max: 5, answer: 9 }), /recta numérica/],
    ['a number line too long', (d: LessonDoc) => (d.screens[2].blocks[0] = { type: 'numberLine', question: bi('¿Dónde?', 'Where?'), min: 0, max: 50, answer: 9 }), /recta numérica/],
    ['emoji with words', (d: LessonDoc) => (d.screens[0].blocks[0] = { type: 'explain', text: bi('Hola.', 'Hi.'), emoji: 'una planta' }), /emoji/],
    ['a fill-word without blank', (d: LessonDoc) => (d.quiz[1] = { type: 'fillWord', sentence: bi('La raíz bebe agua.', 'The root drinks water.'), options: [bi('agua', 'water'), bi('sol', 'sun')], correct: 0 }), /___/],
    ['a sort with one group empty', (d: LessonDoc) => (d.screens[3].blocks[0] = { type: 'sort', question: bi('Clasifica.', 'Sort.'), groups: [bi('Vivo', 'Alive'), bi('No vivo', 'Not alive')], items: [{ text: bi('Perro', 'Dog'), group: 0 }, { text: bi('Gato', 'Cat'), group: 0 }, { text: bi('Pez', 'Fish'), group: 0 }] }), /cada grupo/],
    ['repeated options', (d: LessonDoc) => (d.quiz[0] = { type: 'choice', question: bi('¿Cuál?', 'Which?'), options: [{ text: bi('Raíz', 'Root') }, { text: bi('Raíz', 'Root') }], correct: 0 }), /repetidas/],
  ])('%s is reported', (_name, mutate, message) => {
    const doc = valid();
    mutate(doc);
    const issues = checkLesson(doc);
    expect(issues.some((i) => message.test(i))).toBe(true);
  });

  it('a long title (copied from the school agenda) is not a sentence to limit', () => {
    const doc = valid();
    doc.title = bi('Leer la página 24 del libro de lectura y responder las preguntas del final con buena letra', 'Read page 24');
    expect(checkLesson(doc)).toEqual([]);
  });

  it('a 12-word sentence is fine and words in the other language count too', () => {
    const doc = valid();
    doc.screens[0].blocks[0] = { type: 'explain', text: bi('Uno dos tres cuatro cinco seis siete ocho nueve diez once doce.', 'Short.') };
    expect(checkLesson(doc)).toEqual([]);
  });
});

describe('sentenceWords', () => {
  it('splits on . ! ? and counts words', () => {
    expect(sentenceWords('Hola, Lucca. ¿Cómo estás hoy? ¡Bien!')).toEqual([2, 3, 1]);
  });
});

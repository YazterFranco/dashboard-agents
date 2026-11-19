import { bi, type BiText, type LessonDoc, type Subject } from '@lucca/shared';
import type { LessonTask } from './generate.js';

const SUBJECT: Record<Subject, [string, string, string]> = {
  math: ['Matemáticas', 'Math', '🔢'],
  spanish: ['Español', 'Spanish', '📖'],
  english: ['Inglés', 'English', '💬'],
  science: ['Ciencias', 'Science', '🔬'],
  social: ['Sociales', 'Social studies', '🌎'],
  art: ['Arte', 'Art', '🎨'],
  music: ['Música', 'Music', '🎵'],
  pe: ['Educación física', 'PE', '⚽'],
  religion: ['Religión', 'Religion', '🕊️'],
  other: ['La tarea', 'Homework', '📚'],
};

/**
 * Lección sencilla de respaldo, sin IA: cómo abordar la tarea paso a paso. Se usa cuando la IA falla tres veces o se
 * niega. Siempre pasa los controles (lo comprueban las pruebas para todas las materias).
 */
export function fallbackLesson(task: LessonTask): LessonDoc {
  const [es, en, emoji] = SUBJECT[task.subject];
  const title: BiText = bi(task.title, task.titleEn || task.title);
  return {
    title,
    screens: [
      { blocks: [{ type: 'explain', text: bi(`Hoy toca ${es}. ¡Vamos paso a paso!`, `Today is ${en}. Let's go step by step!`), emoji }] },
      { blocks: [{ type: 'explain', text: bi('Primero, lee la tarea con calma.', 'First, read the homework calmly.'), emoji: '👀' }] },
      { blocks: [{ type: 'explain', text: bi('Luego, prepara tu lápiz y tu cuaderno.', 'Then, get your pencil and notebook ready.'), emoji: '✏️' }] },
      {
        blocks: [
          {
            type: 'order',
            question: bi('Ordena los pasos.', 'Put the steps in order.'),
            items: [bi('Leer la tarea', 'Read the homework'), bi('Preparar el lápiz', 'Get the pencil'), bi('Hacer la tarea', 'Do the homework')],
          },
        ],
      },
      { blocks: [{ type: 'explain', text: bi('Si algo no entiendes, pide ayuda a papá.', 'If you get stuck, ask Dad for help.'), emoji: '🤝' }] },
    ],
    quiz: [
      { type: 'trueFalse', statement: bi('Leer con calma me ayuda.', 'Reading calmly helps me.'), answer: true },
      {
        type: 'choice',
        question: bi('¿Qué hago si no entiendo algo?', 'What do I do if I get stuck?'),
        options: [
          { text: bi('Pido ayuda', 'I ask for help'), emoji: '🙋' },
          { text: bi('Me rindo', 'I give up'), emoji: '😞' },
        ],
        correct: 0,
      },
    ],
  };
}

import { TaskSchema, addDays, mondayOf, plannerToday, weekdayOf, type IsoDate, type Subject, type TaskStatus } from '@lucca/shared';
import type { LuccaDb } from './db.js';

interface DemoTask {
  /** 0 = lunes … 4 = viernes */
  day: number;
  subject: Subject;
  es: string;
  en: string;
  status?: TaskStatus;
}

const DEMO_TASKS: DemoTask[] = [
  { day: 0, subject: 'math', es: 'Sumas con llevadas, pág. 24', en: 'Addition with carrying, p. 24', status: 'done' },
  { day: 0, subject: 'english', es: 'Palabras: cat, hat, bat', en: 'Spelling: cat, hat, bat', status: 'done' },
  { day: 1, subject: 'science', es: 'Las partes de la planta', en: 'The parts of a plant', status: 'doing' },
  { day: 1, subject: 'math', es: 'Restas sin llevar, pág. 26', en: 'Subtraction, p. 26' },
  { day: 1, subject: 'spanish', es: 'Leer “La semilla mágica” y dibujar el final', en: 'Read “The Magic Seed” and draw the ending' },
  { day: 2, subject: 'english', es: 'Lectura: “My Pet”', en: 'Reading: “My Pet”' },
  { day: 2, subject: 'art', es: 'Dibujo de mi familia', en: 'A drawing of my family' },
  { day: 3, subject: 'math', es: 'Problemas con monedas', en: 'Problems with coins' },
  { day: 3, subject: 'science', es: 'Traer una hoja del jardín', en: 'Bring a leaf from the garden' },
  { day: 4, subject: 'spanish', es: 'Dictado de palabras con “ll”', en: 'Dictation: words with “ll”' },
];

function nextSchoolDay(date: IsoDate): IsoDate {
  let d = addDays(date, 1);
  while (weekdayOf(d) === 0 || weekdayOf(d) === 6) d = addDays(d, 1);
  return d;
}

/**
 * Tareas de ejemplo para probar sin Mereb (LUCCA_DEMO=1). Los ids llevan el lunes de la semana,
 * y una tarea que ya existe no se toca: reiniciar el servidor no borra el progreso de la demo.
 */
export function seedDemo(db: LuccaDb, today: IsoDate): void {
  const monday = mondayOf(plannerToday(today));
  const counters: Record<number, number> = {};
  for (const demo of DEMO_TASKS) {
    counters[demo.day] = (counters[demo.day] ?? 0) + 1;
    const id = `demo-${monday}-${demo.day}-${counters[demo.day]}`;
    if (db.getTask(id)) continue;
    const date = addDays(monday, demo.day);
    db.upsertTask(
      TaskSchema.parse({
        id,
        subject: demo.subject,
        title: demo.es,
        titleTranslations: { en: demo.en },
        source: 'manual',
        assignedDate: date,
        dueDate: nextSchoolDay(date),
        status: demo.status ?? 'todo',
      }),
    );
  }
}

import { KidStateSchema, TaskSchema, type KidState, type Task } from '@lucca/shared';

export function task(p: Partial<Task> & { id: string }): Task {
  return TaskSchema.parse({ subject: 'math', title: `Tarea ${p.id}`, source: 'manual', ...p });
}

/** La semana de la demo: lunes 16 a viernes 20 de noviembre de 2026, hoy martes 17. */
export function demoState(overrides: Partial<KidState> = {}): KidState {
  const tasks = [
    task({ id: 'mon-math', subject: 'math', title: 'Sumas con llevadas, pág. 24', assignedDate: '2026-11-16', dueDate: '2026-11-17', status: 'done' }),
    task({ id: 'mon-eng', subject: 'english', title: 'Palabras: cat, hat, bat', assignedDate: '2026-11-16', dueDate: '2026-11-17', status: 'done' }),
    task({
      id: 'tue-sci',
      subject: 'science',
      title: 'Las partes de la planta',
      titleTranslations: { en: 'The parts of a plant' },
      assignedDate: '2026-11-17',
      dueDate: '2026-11-18',
      status: 'doing',
    }),
    task({ id: 'tue-math', subject: 'math', title: 'Restas sin llevar, pág. 26', titleTranslations: { en: 'Subtraction, p. 26' }, assignedDate: '2026-11-17', dueDate: '2026-11-18' }),
    task({ id: 'tue-span', subject: 'spanish', title: 'Leer “La semilla mágica” y dibujar el final', assignedDate: '2026-11-17', dueDate: '2026-11-18' }),
    task({ id: 'wed-eng', subject: 'english', title: 'Lectura: “My Pet”', assignedDate: '2026-11-18', dueDate: '2026-11-19' }),
    task({ id: 'wed-art', subject: 'art', title: 'Dibujo de mi familia', assignedDate: '2026-11-18', dueDate: '2026-11-19' }),
  ];
  return KidStateSchema.parse({
    today: '2026-11-17',
    weekStart: '2026-11-16',
    settings: {},
    tasks,
    starsThisWeek: 7,
    ...overrides,
  });
}

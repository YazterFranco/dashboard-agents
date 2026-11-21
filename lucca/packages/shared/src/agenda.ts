import { z } from 'zod';
import { IsoDateSchema, SUBJECTS, type Subject } from './schemas.js';

/** Sin acentos y en mayúsculas: así se comparan los nombres que escribe cada docente. */
export function foldText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

/** Palabras que la agenda a veces escribe sin tilde: al ponerlas bonitas se les devuelve. */
const ACCENTS: Record<string, string> = {
  MATEMATICAS: 'Matemáticas',
  MATEMATICA: 'Matemática',
  ESPANOL: 'Español',
  MUSICA: 'Música',
  EDUCACION: 'Educación',
  FISICA: 'Física',
  RELIGION: 'Religión',
  INGLES: 'Inglés',
  ARTISTICA: 'Artística',
  INFORMATICA: 'Informática',
  TECNOLOGIA: 'Tecnología',
  EVALUACION: 'Evaluación',
  CALIGRAFIA: 'Caligrafía',
  PANAMA: 'Panamá',
  FOLCLORICO: 'Folclórico',
  ROBOTICA: 'Robótica',
};

const SMALL_WORDS = new Set(['y', 'e', 'o', 'de', 'del', 'la', 'el', 'los', 'las', 'en', 'and', 'of', 'the', 'a', 'to']);

/**
 * Nombre legible a partir de lo que trae la agenda: lo escrito todo en mayúsculas pasa a mayúsculas de título
 * (con las palabras cortas en minúscula), las barras quedan con espacios y los guiones sueltos se quitan.
 */
export function prettyLabel(raw: string): string {
  const tidy = raw
    .replace(/\s+-\s+/g, ' ')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim();
  if (/\p{Ll}/u.test(tidy)) return tidy;
  return tidy
    .split(' ')
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (i > 0 && SMALL_WORDS.has(lower)) return lower;
      const fixed = ACCENTS[foldText(word)];
      if (fixed && fixed.length === word.length) return fixed;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/** Orden importa: lo más específico primero («Ciencias Sociales» antes que «Ciencias»). */
const SUBJECT_RULES: Array<[RegExp, Subject]> = [
  [/MATEMAT|\bMATH/, 'math'],
  [/SOCIAL/, 'social'],
  [/ESPANOL|LENGUA|CALIGRAF|LECTOESCRITURA/, 'spanish'],
  [/SCIENCE|CIENCIA/, 'science'],
  [/READING|SPELLING|PHONICS|WRITING|GRAMMAR|ENGLISH|INGLES/, 'english'],
  [/MUSIC|FOLKLORE|FOLCLOR|DANZA|BAILE|CANTO/, 'music'],
  [/\bART\b|\bARTE\b|ARTISTICA|DIBUJO/, 'art'],
  [/EDUCACION FISICA|PHYSICAL|DEPORTE|\bP\.?E\.?\b/, 'pe'],
  [/RELIGION|VALORES|CATEQUESIS/, 'religion'],
];

/** Materia conocida (o «other») y el nombre original bonito como etiqueta. */
export function mapSubject(raw: string): { subject: Subject; label: string } {
  const label = prettyLabel(raw);
  if (!label) return { subject: 'other', label: 'Otra' };
  const folded = foldText(raw);
  const rule = SUBJECT_RULES.find(([re]) => re.test(folded));
  return { subject: rule ? rule[1] : 'other', label };
}

/** Tarea propuesta a partir de la agenda: el padre la revisa antes de que exista. */
export const TaskDraftSchema = z.object({
  /** Parte estable del id: misma semana, materia y tema → misma tarea al volver a importar. */
  key: z.string().regex(/^[a-z0-9-]{1,120}$/, 'Clave inválida'),
  subject: z.enum(SUBJECTS),
  subjectLabel: z.string().trim().max(60),
  title: z.string().trim().min(1, 'Escribe el título').max(200, 'El título puede tener hasta 200 caracteres'),
  description: z.string().trim().max(2000),
  /** Día en que la agenda la pone: el de la evaluación o entrega. */
  dueDate: IsoDateSchema,
  /** Tipo de evaluación tal como lo nombra la agenda («Ejercicio 3», «Test 1»…), o vacío. */
  kind: z.string().trim().max(80),
});
export type TaskDraft = z.infer<typeof TaskDraftSchema>;

export const AgendaImportBodySchema = z.object({
  tasks: z.array(TaskDraftSchema).min(1, 'Elige al menos una tarea').max(60, 'Son demasiadas tareas de una vez'),
});
export type AgendaImportBody = z.infer<typeof AgendaImportBodySchema>;

/** Lo que el servidor entiende de un PDF de la agenda. */
export interface AgendaPreview {
  /** Primer y último día de la semana que dice el PDF, si lo dice. */
  weekStart: string | null;
  weekEnd: string | null;
  drafts: TaskDraft[];
}

/** Qué pasaría al añadirla: nueva, ya está igual, cambiaría la que existe, o papá la había quitado (no vuelve). */
export type DraftState = 'new' | 'same' | 'update' | 'removed';
export type AgendaPreviewItem = TaskDraft & { state: DraftState };

export interface AgendaImportResult {
  added: number;
  updated: number;
  unchanged: number;
  /** Tareas que el padre ya había quitado: no se vuelven a crear. */
  skipped: number;
}

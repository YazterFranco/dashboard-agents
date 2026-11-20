import { z } from 'zod';

/** Fecha local `YYYY-MM-DD`, sin hora ni zona: se compara y ordena como texto. */
export type IsoDate = string;

export const IsoDateSchema = z
  .string({ error: 'Escribe una fecha válida' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Escribe una fecha válida')
  .refine((s) => {
    const [y, m, d] = s.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  }, 'Esa fecha no existe');

export const SUBJECTS = ['math', 'spanish', 'english', 'science', 'social', 'art', 'music', 'pe', 'religion', 'other'] as const;
export type Subject = (typeof SUBJECTS)[number];

export const TASK_STATUSES = ['todo', 'doing', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const LANGS = ['es', 'en'] as const;
export type Lang = (typeof LANGS)[number];

export const VOICE_MODES = ['audio', 'text', 'both'] as const;
export type VoiceMode = (typeof VOICE_MODES)[number];

export const THEMES = ['dark', 'light'] as const;
export type Theme = (typeof THEMES)[number];

export const TaskSchema = z.object({
  id: z.string().min(1),
  subject: z.enum(SUBJECTS),
  subjectLabel: z.string().optional(),
  title: z.string().min(1),
  titleTranslations: z.partialRecord(z.enum(LANGS), z.string()).default({}),
  description: z.string().default(''),
  assignedDate: IsoDateSchema.nullable().default(null),
  dueDate: IsoDateSchema.nullable().default(null),
  source: z.enum(['mereb', 'photo', 'manual']),
  status: z.enum(TASK_STATUSES).default('todo'),
  hidden: z.boolean().default(false),
  retired: z.boolean().default(false),
});
export type Task = z.infer<typeof TaskSchema>;

/** Cada ajuste por separado y sin valor por defecto: sirven para validar un parche sin reponer lo que no se tocó. */
export const SettingsFields = {
  childName: z.string({ error: 'Escribe el nombre' }).trim().min(1, 'Escribe el nombre').max(30, 'El nombre puede tener hasta 30 letras'),
  grade: z.number({ error: 'Elige el grado' }).int('Elige el grado').min(1, 'El grado va de 1 a 6').max(6, 'El grado va de 1 a 6'),
  lang: z.enum(LANGS, { error: 'Elige el idioma' }),
  voiceMode: z.enum(VOICE_MODES, { error: 'Elige cómo quiere aprender' }),
  theme: z.enum(THEMES, { error: 'Elige el tema' }),
  speechRate: z.number({ error: 'La velocidad va de 0,7 a 1,2' }).min(0.7, 'La velocidad va de 0,7 a 1,2').max(1.2, 'La velocidad va de 0,7 a 1,2'),
  tz: z.string().min(1),
  aiMonthlyCapUsd: z.number({ error: 'El tope va de 1 a 200 dólares' }).min(1, 'El tope va de 1 a 200 dólares').max(200, 'El tope va de 1 a 200 dólares'),
};

export const SettingsSchema = z.object({
  childName: SettingsFields.childName.default('Lucca'),
  grade: SettingsFields.grade.default(2),
  lang: SettingsFields.lang.default('es'),
  voiceMode: SettingsFields.voiceMode.default('both'),
  theme: SettingsFields.theme.default('dark'),
  speechRate: SettingsFields.speechRate.default(0.9),
  tz: SettingsFields.tz.default('America/Panama'),
  aiMonthlyCapUsd: SettingsFields.aiMonthlyCapUsd.default(20),
});
export type Settings = z.infer<typeof SettingsSchema>;

/** Lo que el servidor entrega a la pantalla de Lucca; la web calcula la vista del día con esto. */
export const KidStateSchema = z.object({
  today: IsoDateSchema,
  weekStart: IsoDateSchema,
  settings: SettingsSchema,
  tasks: z.array(TaskSchema),
  starsThisWeek: z.number().int().nonnegative(),
  /** Preguntas de «Repaso rápido» que tocan hoy. */
  reviewDue: z.number().int().nonnegative().default(0),
  /** Tareas cuya lección «Entender» ya terminó Lucca alguna vez. */
  understood: z.array(z.string()).default([]),
});
export type KidState = z.infer<typeof KidStateSchema>;

export function taskTitle(task: Task, lang: Lang): string {
  return task.titleTranslations[lang] ?? task.title;
}

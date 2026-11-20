import { z } from 'zod';
import { IsoDateSchema, SettingsFields, SUBJECTS, TASK_STATUSES, type IsoDate } from './schemas.js';

/** PIN del padre: de 4 a 6 dígitos, sin espacios ni letras. */
export const PinSchema = z.string({ error: 'El PIN debe tener de 4 a 6 dígitos' }).regex(/^\d{4,6}$/, 'El PIN debe tener de 4 a 6 dígitos');

/** La entrega no puede ser antes del día asignado; con una fecha que falta no hay nada que comparar. */
export function datesInOrder(assigned: IsoDate | null, due: IsoDate | null): boolean {
  return assigned === null || due === null || due >= assigned;
}

const DATES_MESSAGE = 'La entrega no puede ser antes del día asignado';

/** Campos de una tarea, sin valores por defecto: sirven para el alta (con defaults) y para el parche (todo opcional). */
const taskFields = {
  subject: z.enum(SUBJECTS, { error: 'Elige la materia' }),
  subjectLabel: z.string().trim().max(60, 'El nombre de la materia puede tener hasta 60 letras'),
  title: z.string({ error: 'Escribe el título' }).trim().min(1, 'Escribe el título').max(200, 'El título puede tener hasta 200 caracteres'),
  titleEn: z.string().trim().max(200, 'El título en inglés puede tener hasta 200 caracteres'),
  description: z.string().trim().max(2000, 'La descripción puede tener hasta 2000 caracteres'),
  assignedDate: IsoDateSchema.nullable(),
  dueDate: IsoDateSchema.nullable(),
};

export const TaskInputSchema = z
  .object({
    subject: taskFields.subject,
    subjectLabel: taskFields.subjectLabel.optional(),
    title: taskFields.title,
    titleEn: taskFields.titleEn.optional(),
    description: taskFields.description.default(''),
    assignedDate: taskFields.assignedDate.default(null),
    dueDate: taskFields.dueDate.default(null),
  })
  .refine((t) => datesInOrder(t.assignedDate, t.dueDate), { message: DATES_MESSAGE, path: ['dueDate'] });
export type TaskInput = z.infer<typeof TaskInputSchema>;

/** Parche: todo opcional. Que las fechas queden en orden se comprueba con el resultado combinado, no aquí. */
export const TaskPatchSchema = z
  .object({
    ...taskFields,
    status: z.enum(TASK_STATUSES, { error: 'Estado inválido' }),
    hidden: z.boolean({ error: 'Valor inválido' }),
  })
  .partial();
export type TaskPatch = z.infer<typeof TaskPatchSchema>;
export { DATES_MESSAGE };

export const SetupBodySchema = z.object({
  pin: PinSchema,
  childName: SettingsFields.childName,
  grade: SettingsFields.grade,
  lang: SettingsFields.lang,
  theme: SettingsFields.theme,
});
export type SetupBody = z.infer<typeof SetupBodySchema>;

export const LoginBodySchema = z.object({ pin: z.string({ error: 'El PIN debe tener de 4 a 6 dígitos' }) });

export const ChangePinBodySchema = z.object({
  currentPin: z.string({ error: 'Escribe tu PIN actual' }),
  newPin: PinSchema,
});

/** Ajustes que el padre puede cambiar: todos menos la zona horaria, y sin claves desconocidas. */
export const SettingsPatchSchema = z
  .strictObject({
    childName: SettingsFields.childName,
    grade: SettingsFields.grade,
    lang: SettingsFields.lang,
    voiceMode: SettingsFields.voiceMode,
    theme: SettingsFields.theme,
    speechRate: SettingsFields.speechRate,
    aiMonthlyCapUsd: SettingsFields.aiMonthlyCapUsd,
    pauseMinutes: SettingsFields.pauseMinutes,
  })
  .partial();
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;

/** Primer mensaje de error de cada campo (clave `dueDate`, `title`, `pin`…); los errores sin campo van en `_`. */
export function fieldErrors(error: z.ZodError, fallbackKey = '_'): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) if (!(key in out)) out[key] = 'Este ajuste no se puede cambiar';
      continue;
    }
    const key = issue.path.length ? issue.path.join('.') : fallbackKey;
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

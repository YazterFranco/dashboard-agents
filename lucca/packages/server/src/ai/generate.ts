import { LessonDocSchema, checkLesson, type LessonDoc, type Subject } from '@lucca/shared';
import { fallbackLesson } from './fallback.js';

export interface LessonTask {
  subject: Subject;
  title: string;
  titleEn: string;
  description: string;
}

/** Lo que se pide a la IA. Nunca lleva el nombre del niño ni datos del colegio (minimización, D4). */
export interface LessonRequest {
  task: LessonTask;
  grade: number;
  /** `alternative`: «Explícamelo de otra forma» (otro enfoque, más visual o con objetos de casa). */
  variant: 'default' | 'alternative';
  /** Problemas del intento anterior, para que la IA los corrija. */
  previousIssues?: string[];
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export type ModelResult = { kind: 'ok'; doc: unknown; usage: Usage } | { kind: 'refusal'; usage: Usage };

/** Cualquier fuente de lecciones: la IA real, las grabadas o una de mentira en las pruebas. */
export interface LessonModel {
  generate(req: LessonRequest): Promise<ModelResult>;
}

export interface GeneratedLesson {
  doc: LessonDoc;
  source: 'ai' | 'fallback';
  attempts: number;
  usage: Usage[];
  /** Por qué se descartaron los intentos (para el aviso a papá). */
  issues: string[];
}

const MAX_ATTEMPTS = 3;

/**
 * Pide la lección hasta 3 veces. Cada respuesta pasa el esquema y los controles (D6); si falla, el siguiente intento
 * recibe los motivos. Un rechazo de la IA no se repite. Si nada sirve, la lección sencilla de respaldo: nunca una rota.
 */
export async function generateLesson(model: LessonModel, req: LessonRequest): Promise<GeneratedLesson> {
  const usage: Usage[] = [];
  const issues: string[] = [];
  let previousIssues: string[] | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let result: ModelResult;
    try {
      result = await model.generate({ ...req, previousIssues });
    } catch (err) {
      issues.push(`intento ${attempt}: la IA no respondió (${(err as Error).message.slice(0, 120)})`);
      continue;
    }
    usage.push(result.usage);
    if (result.kind === 'refusal') {
      issues.push(`intento ${attempt}: la IA rechazó la petición`);
      return { doc: fallbackLesson(req.task), source: 'fallback', attempts: attempt, usage, issues };
    }
    const parsed = LessonDocSchema.safeParse(result.doc);
    const found = parsed.success ? checkLesson(parsed.data) : parsed.error.issues.slice(0, 8).map((i) => `${i.path.join('.') || 'documento'}: ${i.message}`);
    if (parsed.success && found.length === 0) return { doc: parsed.data, source: 'ai', attempts: attempt, usage, issues };
    issues.push(...found.map((f) => `intento ${attempt}: ${f}`));
    previousIssues = found;
  }
  return { doc: fallbackLesson(req.task), source: 'fallback', attempts: MAX_ATTEMPTS, usage, issues };
}

import type { FastifyInstance } from 'fastify';
import {
  AgendaImportBodySchema,
  TaskSchema,
  fieldErrors,
  localDate,
  type AgendaImportResult,
  type AgendaPreviewItem,
  type DraftState,
  type Task,
  type TaskDraft,
} from '@lucca/shared';
import type { Config } from '../config.js';
import type { LuccaDb } from '../db.js';
import { parseMerebAgenda } from './merebPdf.js';
import { PdfReadError, readPdfText } from './pdfText.js';

const MAX_PDF_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_BYTES = 256 * 1024;

export interface AgendaDeps {
  db: LuccaDb;
  config: Config;
  now: () => Date;
}

const idOf = (draft: Pick<TaskDraft, 'key'>): string => `mereb-${draft.key}`;

/** La tarea que quedaría al añadir la propuesta: lo que es de la agenda se actualiza; estado, ocultar e inglés se conservan. */
function merged(draft: TaskDraft, existing: Task | null): Task {
  return TaskSchema.parse({
    ...(existing ?? { status: 'todo', hidden: false, titleTranslations: {} }),
    id: idOf(draft),
    source: 'mereb',
    subject: draft.subject,
    ...(draft.subjectLabel ? { subjectLabel: draft.subjectLabel } : { subjectLabel: undefined }),
    title: draft.title,
    description: draft.description,
    dueDate: draft.dueDate,
    assignedDate: existing?.assignedDate && existing.assignedDate <= draft.dueDate ? existing.assignedDate : null,
    retired: false,
  });
}

const sameContent = (a: Task, b: Task, { ignoreTitle = false } = {}): boolean =>
  a.subject === b.subject &&
  (a.subjectLabel ?? '') === (b.subjectLabel ?? '') &&
  (ignoreTitle || a.title === b.title) &&
  a.description === b.description &&
  a.dueDate === b.dueDate &&
  a.assignedDate === b.assignedDate;

/**
 * Qué pasaría con la propuesta. El título no cuenta: la clave ya lleva el título de la agenda (si la docente lo cambia
 * es otra tarea), así que un título distinto aquí es una corrección de papá, no un cambio de la agenda.
 */
function stateOf(draft: TaskDraft, db: LuccaDb): DraftState {
  const existing = db.getTask(idOf(draft));
  if (!existing) return 'new';
  if (existing.retired) return 'removed';
  return sameContent(existing, merged(draft, existing), { ignoreTitle: true }) ? 'same' : 'update';
}

/** Rutas de la agenda en PDF. Se registran dentro del ámbito que exige el PIN de papá. */
export function registerAgendaRoutes(scope: FastifyInstance, deps: AgendaDeps): void {
  const { db, config, now } = deps;

  scope.addContentTypeParser('application/pdf', { parseAs: 'buffer', bodyLimit: MAX_PDF_BYTES }, (_req, body, done) => done(null, body));

  scope.post(
    '/api/parent/agenda/pdf',
    {
      bodyLimit: MAX_PDF_BYTES,
      errorHandler: (error, _req, reply) => {
        if ((error as { code?: string }).code === 'FST_ERR_CTP_BODY_TOO_LARGE') return reply.code(413).send({ error: 'El PDF pesa más de 5 MB' });
        if ((error as { code?: string }).code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') return reply.code(415).send({ error: 'Sube el PDF de la agenda' });
        return reply.send(error);
      },
    },
    async (req, reply) => {
      if (!Buffer.isBuffer(req.body)) return reply.code(415).send({ error: 'Sube el PDF de la agenda' });
      let preview;
      try {
        preview = parseMerebAgenda(await readPdfText(new Uint8Array(req.body)), { today: localDate(now(), config.tz) });
      } catch (err) {
        if (err instanceof PdfReadError) {
          return reply.code(422).send({ error: 'No pude leer ese PDF. Descárgalo otra vez desde Mereb e inténtalo de nuevo.' });
        }
        throw err;
      }
      if (preview.drafts.length === 0) {
        return reply
          .code(422)
          .send({ error: 'No encontré actividades en este PDF. ¿Es la exportación de la agenda de Mereb («Exportar actividades»)?' });
      }
      const drafts: AgendaPreviewItem[] = preview.drafts.map((d) => ({ ...d, state: stateOf(d, db) }));
      return { ...preview, drafts };
    },
  );

  scope.post('/api/parent/agenda/import', { bodyLimit: MAX_IMPORT_BYTES }, async (req, reply) => {
    const body = AgendaImportBodySchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos inválidos', fields: fieldErrors(body.error) });
    const result: AgendaImportResult = { added: 0, updated: 0, unchanged: 0, skipped: 0 };
    for (const draft of body.data.tasks) {
      const existing = db.getTask(idOf(draft));
      if (existing?.retired) {
        result.skipped++;
        continue;
      }
      const next = merged(draft, existing);
      if (existing && sameContent(existing, next)) {
        result.unchanged++;
        continue;
      }
      // Si cambió de qué trata, la lección guardada ya no sirve: se hará otra cuando Lucca la abra.
      if (existing && (existing.title !== next.title || existing.description !== next.description || existing.subject !== next.subject)) {
        db.deleteLessons(existing.id);
      }
      db.upsertTask(next);
      if (existing) result.updated++;
      else result.added++;
    }
    return result;
  });
}

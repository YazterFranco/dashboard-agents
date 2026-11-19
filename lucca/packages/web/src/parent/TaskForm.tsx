import { useEffect, useRef, useState, type FormEvent } from 'react';
import { DATES_MESSAGE, SUBJECTS, TaskInputSchema, datesInOrder, fieldErrors, type IsoDate, type Task } from '@lucca/shared';
import { subjectName } from '../i18n';
import { ApiError, type TaskBody } from './api';
import { Field, FormError, GENERIC_ERROR, NETWORK_SAVE_ERROR } from './fields';

type Key = 'subject' | 'title' | 'titleEn' | 'assignedDate' | 'dueDate' | 'description';
type Errors = Partial<Record<Key, string>>;
const ORDER: Key[] = ['subject', 'title', 'titleEn', 'assignedDate', 'dueDate', 'description'];
const IDS: Record<Key, string> = {
  subject: 'task-subject',
  title: 'task-title',
  titleEn: 'task-title-en',
  assignedDate: 'task-assigned',
  dueDate: 'task-due',
  description: 'task-description',
};

interface Draft {
  subject: string;
  title: string;
  titleEn: string;
  assignedDate: string;
  dueDate: string;
  description: string;
}

function validate(d: Draft): { values?: TaskBody; errors: Errors } {
  const parsed = TaskInputSchema.safeParse({
    subject: d.subject || undefined,
    title: d.title,
    titleEn: d.titleEn,
    description: d.description,
    assignedDate: d.assignedDate || null,
    dueDate: d.dueDate || null,
  });
  const errors: Errors = parsed.success ? {} : (fieldErrors(parsed.error) as Errors);
  // El orden de las fechas se comprueba aparte: así se ve aunque otro campo tenga un error.
  if (!errors.dueDate && !datesInOrder(d.assignedDate || null, d.dueDate || null)) errors.dueDate = DATES_MESSAGE;
  if (!parsed.success || Object.keys(errors).length > 0) return { errors };
  const v = parsed.data;
  return {
    errors,
    values: {
      subject: v.subject,
      title: v.title,
      ...(v.titleEn !== undefined ? { titleEn: v.titleEn } : {}),
      description: v.description,
      assignedDate: v.assignedDate,
      dueDate: v.dueDate,
    },
  };
}

interface Props {
  initial?: Task;
  /** Día que se propone al crear una tarea nueva (el día que se está viendo). */
  defaultDate: IsoDate;
  onSubmit(values: TaskBody): Promise<void>;
  onCancel(): void;
}

/** Crear o editar una tarea. Valida al salir de cada campo y al enviar, con el motivo junto al campo. */
export function TaskForm({ initial, defaultDate, onSubmit, onCancel }: Props) {
  const [draft, setDraft] = useState<Draft>({
    subject: initial?.subject ?? '',
    title: initial?.title ?? '',
    titleEn: initial?.titleTranslations.en ?? '',
    assignedDate: initial ? (initial.assignedDate ?? '') : defaultDate,
    dueDate: initial?.dueDate ?? '',
    description: initial?.description ?? '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const root = useRef<HTMLFormElement>(null);

  useEffect(() => {
    document.getElementById(IDS.title)?.focus();
    root.current?.scrollIntoView?.({ block: 'nearest' });
  }, []);

  const related = (key: Key): Key[] => (key === 'assignedDate' ? ['assignedDate', 'dueDate'] : [key]);

  function change(key: Key, value: string) {
    const next = { ...draft, [key]: value };
    setDraft(next);
    // Con un error a la vista, se revisa en cada tecla: en cuanto queda bien, el mensaje desaparece.
    const fresh = validate(next).errors;
    setErrors((prev) => {
      const out = { ...prev };
      for (const k of related(key)) {
        if (!prev[k]) continue;
        if (fresh[k]) out[k] = fresh[k];
        else delete out[k];
      }
      return out;
    });
  }

  function blur(key: Key) {
    const fresh = validate(draft).errors;
    setErrors((prev) => {
      const out = { ...prev };
      for (const k of related(key)) {
        if (fresh[k]) out[k] = fresh[k];
        else delete out[k];
      }
      return out;
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current) return;
    const { values, errors: found } = validate(draft);
    setErrors(found);
    setGeneral(null);
    if (!values) {
      const first = ORDER.find((k) => found[k]);
      if (first) document.getElementById(IDS[first])?.focus();
      return;
    }
    sending.current = true;
    setBusy(true);
    try {
      // Al crear, un título en inglés vacío no se manda; al editar sí, para que el servidor lo quite si ya existía.
      const { titleEn, ...withoutEnglish } = values;
      await onSubmit(initial || titleEn ? { ...withoutEnglish, titleEn: titleEn ?? '' } : withoutEnglish);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      if (err instanceof ApiError) {
        const mapped: Errors = {};
        let rest: string | null = null;
        for (const [key, message] of Object.entries(err.fields)) {
          if (key in IDS) mapped[key as Key] = message;
          else rest ??= message;
        }
        setErrors(mapped);
        const first = ORDER.find((k) => mapped[k]);
        if (first) document.getElementById(IDS[first])?.focus();
        setGeneral(first ? rest : (rest ?? (err.status === 404 ? err.message : GENERIC_ERROR)));
      } else {
        setGeneral(NETWORK_SAVE_ERROR);
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <form ref={root} className="p-card p-form" onSubmit={submit} noValidate onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
      <h2>{initial ? 'Editar tarea' : 'Nueva tarea'}</h2>
      <Field id={IDS.subject} label="Materia" error={errors.subject}>
        {(c) => (
          <select {...c} value={draft.subject} onChange={(e) => change('subject', e.target.value)} onBlur={() => blur('subject')}>
            <option value="">Elige la materia</option>
            {SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {subjectName('es', s)}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field id={IDS.title} label="Título" error={errors.title}>
        {(c) => <input {...c} type="text" autoComplete="off" value={draft.title} onChange={(e) => change('title', e.target.value)} onBlur={() => blur('title')} />}
      </Field>
      <Field id={IDS.titleEn} label="Título en inglés" hint="Opcional. Lucca lo ve cuando usa el asistente en inglés." error={errors.titleEn}>
        {(c) => <input {...c} type="text" autoComplete="off" value={draft.titleEn} onChange={(e) => change('titleEn', e.target.value)} onBlur={() => blur('titleEn')} />}
      </Field>
      <div className="p-two">
        <Field id={IDS.assignedDate} label="Día asignado" error={errors.assignedDate}>
          {(c) => <input {...c} type="date" value={draft.assignedDate} onChange={(e) => change('assignedDate', e.target.value)} onBlur={() => blur('assignedDate')} />}
        </Field>
        <Field id={IDS.dueDate} label="Entrega" hint="Opcional." error={errors.dueDate}>
          {(c) => <input {...c} type="date" value={draft.dueDate} onChange={(e) => change('dueDate', e.target.value)} onBlur={() => blur('dueDate')} />}
        </Field>
      </div>
      <Field id={IDS.description} label="Descripción" hint="Opcional." error={errors.description}>
        {(c) => <textarea {...c} rows={3} value={draft.description} onChange={(e) => change('description', e.target.value)} onBlur={() => blur('description')} />}
      </Field>
      {general ? <FormError>{general}</FormError> : null}
      <div className="p-actions">
        <button type="submit" className="p-btn p-btn-primary" disabled={busy} aria-busy={busy || undefined}>
          Guardar tarea
        </button>
        <button type="button" className="p-btn p-btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

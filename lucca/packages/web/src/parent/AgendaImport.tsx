import { useRef, useState } from 'react';
import type { AgendaImportResult, AgendaPreviewItem, DraftState, TaskDraft } from '@lucca/shared';
import { MONTHS_LONG } from '../i18n';
import { ApiError, type AgendaPreviewResponse, type ParentApi } from './api';
import { FormError, GENERIC_ERROR, NETWORK_SAVE_ERROR, plural } from './fields';
import { dayHeading } from './TaskRow';

interface Props {
  preview: AgendaPreviewResponse;
  api: ParentApi;
  /** Ya se añadieron: el resultado y los días de entrega de lo enviado (para ir a esa semana). */
  onDone(result: AgendaImportResult, dueDates: string[]): void;
  onCancel(): void;
}

const STATE_CHIP: Record<DraftState, { text: string; className: string } | null> = {
  new: null,
  update: { text: 'Cambió en la agenda', className: 'p-chip p-chip-doing' },
  same: { text: 'Ya está igual', className: 'p-chip p-chip-done' },
  removed: { text: 'La quitaste: no se vuelve a añadir', className: 'p-chip p-chip-hidden' },
};

/** «del 22 al 28 de noviembre», o «del 28 de diciembre al 3 de enero». */
function rangeText(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  const [m1, d1] = [Number(start.slice(5, 7)) - 1, Number(start.slice(8, 10))];
  const [m2, d2] = [Number(end.slice(5, 7)) - 1, Number(end.slice(8, 10))];
  return m1 === m2 ? `del ${d1} al ${d2} de ${MONTHS_LONG.es[m2]}` : `del ${d1} de ${MONTHS_LONG.es[m1]} al ${d2} de ${MONTHS_LONG.es[m2]}`;
}

/** «Listo: 9 tareas nuevas y 1 actualizada.» */
export function importSummary(r: AgendaImportResult): string {
  const parts = [
    r.added ? plural(r.added, 'tarea nueva', 'tareas nuevas') : null,
    r.updated ? plural(r.updated, 'actualizada', 'actualizadas') : null,
    r.unchanged ? plural(r.unchanged, 'ya estaba', 'ya estaban') : null,
    r.skipped ? `${r.skipped} que quitaste no se ${r.skipped === 1 ? 'volvió' : 'volvieron'} a añadir` : null,
  ].filter((p): p is string => p !== null);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}` : (parts[0] ?? 'nada');
  return r.added || r.updated ? `Listo: ${list}.` : `No había nada nuevo: ${list}.`;
}

/** Revisar lo que se leyó del PDF antes de que exista: elegir, corregir títulos y añadir. */
export function AgendaImport({ preview, api, onDone, onCancel }: Props) {
  const [chosen, setChosen] = useState<Set<string>>(
    () => new Set(preview.drafts.filter((d) => d.state === 'new' || d.state === 'update').map((d) => d.key)),
  );
  const [titles, setTitles] = useState<Record<string, string>>(() => Object.fromEntries(preview.drafts.map((d) => [d.key, d.title])));
  const [titleErrors, setTitleErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  const days = [...new Set(preview.drafts.map((d) => d.dueDate))].sort();
  const count = preview.drafts.filter((d) => chosen.has(d.key)).length;
  const range = rangeText(preview.weekStart, preview.weekEnd);

  const toggle = (key: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  async function submit() {
    if (inFlight.current) return;
    const selected = preview.drafts.filter((d) => chosen.has(d.key));
    const errors: Record<string, string> = {};
    for (const d of selected) if (!titles[d.key]?.trim()) errors[d.key] = 'Escribe el título';
    setTitleErrors(errors);
    const firstBad = Object.keys(errors)[0];
    if (firstBad) {
      document.getElementById(`agenda-title-${firstBad}`)?.focus();
      return;
    }
    const tasks: TaskDraft[] = selected.map(({ state: _state, ...d }) => ({ ...d, title: titles[d.key].trim() }));
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      const result = await api.importAgenda(tasks);
      onDone(result, tasks.map((t) => t.dueDate));
    } catch (err) {
      if (!(err instanceof ApiError)) setError(NETWORK_SAVE_ERROR);
      else if (err.status === 401) setError(null);
      else setError(Object.values(err.fields)[0] ?? (err.status === 400 ? err.message : GENERIC_ERROR));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <section className="p-card p-agenda" aria-labelledby="agenda-heading">
      <h2 id="agenda-heading">{range ? `Agenda ${range}` : 'Agenda de Mereb'}</h2>
      <p className="p-lead">{`Encontré ${plural(preview.drafts.length, 'actividad', 'actividades')}. Revisa y elige cuáles añadir.`}</p>
      <p className="p-hint">Los enlaces y los nombres de los docentes no se guardan. Los adjuntos siguen en Mereb.</p>

      {days.map((day) => (
        <fieldset key={day} className="p-agenda-day">
          <legend className="p-day">{dayHeading(day)}</legend>
          <ul className="p-tasks">
            {preview.drafts
              .filter((d) => d.dueDate === day)
              .map((d) => {
                const chip = STATE_CHIP[d.state];
                const titleError = titleErrors[d.key];
                return (
                  <li key={d.key} className={`p-task p-agenda-item${chosen.has(d.key) ? '' : ' p-agenda-off'}`}>
                    <div className="p-agenda-head">
                      <label className="p-check-hit">
                        <input
                          type="checkbox"
                          className="p-check"
                          aria-label={`Añadir: ${d.title}`}
                          checked={chosen.has(d.key)}
                          disabled={d.state === 'removed' || saving}
                          onChange={() => toggle(d.key)}
                        />
                      </label>
                      <div className="p-chips">
                        <span className="p-subject">{d.subjectLabel}</span>
                        {d.kind ? <span className="p-chip">{d.kind}</span> : null}
                        {chip ? <span className={chip.className}>{chip.text}</span> : null}
                      </div>
                    </div>
                    <div className="p-field">
                      <input
                        id={`agenda-title-${d.key}`}
                        type="text"
                        aria-label={`Título: ${d.title}`}
                        aria-invalid={titleError ? true : undefined}
                        aria-describedby={titleError ? `agenda-title-${d.key}-error` : undefined}
                        value={titles[d.key]}
                        maxLength={200}
                        disabled={d.state === 'removed' || saving}
                        onChange={(e) => {
                          const value = e.target.value;
                          setTitles((t) => ({ ...t, [d.key]: value }));
                          if (titleErrors[d.key] && value.trim()) setTitleErrors(({ [d.key]: _gone, ...rest }) => rest);
                        }}
                      />
                      {titleError ? (
                        <p id={`agenda-title-${d.key}-error`} className="p-error" role="alert">
                          {titleError}
                        </p>
                      ) : null}
                    </div>
                    {d.description ? (
                      <details className="p-agenda-detail">
                        <summary>Ver detalle</summary>
                        <p>{d.description}</p>
                      </details>
                    ) : null}
                  </li>
                );
              })}
          </ul>
        </fieldset>
      ))}

      {count === 0 ? <p className="p-hint">No hay nada marcado para añadir. Marca una actividad o pulsa Cancelar.</p> : null}
      {error ? <FormError>{error}</FormError> : null}
      <div className="p-actions">
        <button type="button" className="p-btn p-btn-primary" disabled={count === 0 || saving} onClick={() => void submit()}>
          {saving ? 'Añadiendo…' : `Añadir ${plural(count, 'tarea', 'tareas')}`}
        </button>
        <button type="button" className="p-btn p-btn-ghost" disabled={saving} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </section>
  );
}

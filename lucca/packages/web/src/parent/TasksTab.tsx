import { useEffect, useRef, useState } from 'react';
import { SUBJECTS, addDays, mondayOf, weekDays, weekdayOf, workDateOf, type IsoDate, type Task } from '@lucca/shared';
import { weekRange } from '../i18n';
import { AgendaImport, importSummary } from './AgendaImport';
import { ApiError, type AgendaPreviewResponse, type ParentApi, type TaskBody } from './api';
import { FormError, GENERIC_ERROR, NETWORK_ERROR, NETWORK_SAVE_ERROR } from './fields';
import { TaskForm } from './TaskForm';
import { TaskRow, dayHeading } from './TaskRow';

interface Props {
  tasks: Task[];
  today: IsoDate;
  onChanged(): void;
  api: ParentApi;
  /** Abrir la lección «Entender» de una tarea en vista previa. */
  onPreview?(task: Task): void;
}

interface Group {
  key: string;
  title: string;
  tasks: Task[];
}

const bySubjectThenTitle = (a: Task, b: Task) => SUBJECTS.indexOf(a.subject) - SUBJECTS.indexOf(b.subject) || a.title.localeCompare(b.title, 'es');

/** Cada tarea en su día de trabajo, sin arrastrar las atrasadas: papá ve lo que hay, no lo que Lucca ve hoy. */
function groupWeek(tasks: Task[], weekStart: IsoDate, today: IsoDate, isCurrent: boolean): Group[] {
  const days = weekDays(weekStart);
  const byDay = new Map<IsoDate, Task[]>(days.map((d) => [d, []]));
  const weekend: Task[] = [];
  const undated: Task[] = [];
  for (const t of tasks) {
    if (t.retired) continue;
    if (!t.assignedDate && !t.dueDate) {
      if (isCurrent) undated.push(t);
      continue;
    }
    const work = workDateOf(t, today);
    if (mondayOf(work) !== weekStart) continue;
    const bucket = byDay.get(work);
    if (bucket) bucket.push(t);
    else weekend.push(t);
  }
  const groups: Group[] = days.map((d) => ({ key: d, title: dayHeading(d), tasks: byDay.get(d)!.sort(bySubjectThenTitle) }));
  groups.push({ key: 'weekend', title: 'Fin de semana', tasks: weekend.sort(bySubjectThenTitle) });
  groups.push({ key: 'undated', title: 'Sin fecha', tasks: undated.sort(bySubjectThenTitle) });
  return groups.filter((g) => g.tasks.length > 0);
}

/** Un fallo al actuar sobre una tarea, dicho junto a ella. Un 401 no dice nada: la pantalla vuelve sola al PIN. */
function describe(err: unknown): string | null {
  if (!(err instanceof ApiError)) return NETWORK_SAVE_ERROR;
  if (err.status === 401) return null;
  const field = Object.values(err.fields)[0];
  if (field) return field;
  return err.status === 404 || err.status === 409 ? err.message : GENERIC_ERROR;
}

const MAX_PDF_BYTES = 5 * 1024 * 1024;

/** Lo que se puede saber del archivo antes de enviarlo; null si parece un PDF razonable. */
function checkPdf(file: File): string | null {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!isPdf) return 'Elige el PDF de la agenda (un archivo que termina en .pdf).';
  if (file.size > MAX_PDF_BYTES) return 'El PDF pesa más de 5 MB';
  return null;
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={direction === 'left' ? 'M14.5 5.5 8 12l6.5 6.5' : 'M9.5 5.5 16 12l-6.5 6.5'} />
    </svg>
  );
}

export function TasksTab({ tasks, today, onChanged, api, onPreview }: Props) {
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<Task | 'new' | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const inFlight = useRef(false);
  const newButton = useRef<HTMLButtonElement>(null);
  /** Qué botón abrió el formulario ('new' o `edit-<id>`): al cerrarlo, el foco vuelve ahí en vez de perderse. */
  const returnFocus = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const importButton = useRef<HTMLButtonElement>(null);
  const [agenda, setAgenda] = useState<AgendaPreviewResponse | null>(null);
  const [agendaBusy, setAgendaBusy] = useState(false);
  const [agendaError, setAgendaError] = useState<string | null>(null);
  const [agendaDone, setAgendaDone] = useState<string | null>(null);

  useEffect(() => {
    if (editing !== null || returnFocus.current === null) return;
    const target = returnFocus.current === 'new' ? null : document.getElementById(returnFocus.current);
    (target ?? newButton.current)?.focus();
    returnFocus.current = null;
  }, [editing]);

  const weekStart = addDays(mondayOf(today), offset * 7);
  const isCurrent = offset === 0;
  const days = weekDays(weekStart);
  const groups = groupWeek(tasks, weekStart, today, isCurrent);

  async function run(id: string, call: () => Promise<unknown>, deleting = false) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(id);
    setMessages(({ [id]: _gone, ...rest }) => rest);
    try {
      await call();
      setConfirming(null);
      onChanged();
      if (deleting) newButton.current?.focus();
    } catch (err) {
      const message = describe(err);
      if (message) setMessages((m) => ({ ...m, [id]: message }));
      if (err instanceof ApiError && err.status === 404) onChanged();
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  const actionsFor = (t: Task) => ({
    toggleDone: () => void run(t.id, () => api.patchTask(t.id, { status: t.status === 'done' ? 'todo' : 'done' })),
    toggleHidden: () => void run(t.id, () => api.patchTask(t.id, { hidden: !t.hidden })),
    edit: () => {
      setConfirming(null);
      returnFocus.current = `edit-${t.id}`;
      setEditing(t);
    },
    move: (date: IsoDate) => {
      if (date === t.assignedDate) return;
      // Si la entrega queda antes del nuevo día, se mueve con él.
      const patch: Partial<TaskBody> = { assignedDate: date };
      if (t.dueDate !== null && t.dueDate < date) patch.dueDate = date;
      void run(t.id, () => api.patchTask(t.id, patch));
    },
    preview: onPreview ? () => onPreview(t) : undefined,
    askDelete: () => setConfirming(t.id),
    confirmDelete: () => void run(t.id, () => api.deleteTask(t.id), true),
    cancelDelete: () => {
      setConfirming(null);
      document.getElementById(`delete-${t.id}`)?.focus();
    },
  });

  async function readAgenda(file: File | undefined) {
    if (fileInput.current) fileInput.current.value = '';
    if (!file) return;
    setAgendaDone(null);
    const problem = checkPdf(file);
    if (problem) {
      setAgendaError(problem);
      return;
    }
    setAgendaError(null);
    setAgendaBusy(true);
    try {
      setEditing(null);
      setAgenda(await api.previewAgenda(file));
    } catch (err) {
      if (!(err instanceof ApiError)) setAgendaError(NETWORK_ERROR);
      else if (err.status !== 401) setAgendaError(err.status >= 500 ? GENERIC_ERROR : err.message);
    } finally {
      setAgendaBusy(false);
    }
  }

  function agendaImported(result: Parameters<typeof importSummary>[0], dueDates: IsoDate[]) {
    setAgenda(null);
    setAgendaDone(importSummary(result));
    onChanged();
    // Ir a la semana de la agenda (la del día del medio), dentro de lo que deja ver la navegación.
    const middle = [...dueDates].sort()[Math.floor(dueDates.length / 2)];
    if (middle) {
      const weeks = Math.round((Date.parse(mondayOf(middle)) - Date.parse(mondayOf(today))) / (7 * 86_400_000));
      setOffset(Math.max(-1, Math.min(1, weeks)));
    }
    importButton.current?.focus();
  }

  async function saveForm(values: TaskBody) {
    if (editing === 'new') await api.createTask(values);
    else if (editing) await api.patchTask(editing.id, values);
    setEditing(null);
    onChanged();
  }

  return (
    <div className="p-tab">
      <div className="p-toolbar">
        <div className="p-weeknav">
          <button type="button" className="p-btn p-btn-ghost p-btn-icon" aria-label="Semana anterior" disabled={offset <= -1} onClick={() => setOffset(offset - 1)}>
            <Chevron direction="left" />
          </button>
          <p className="p-range">
            <span>{weekRange('es', weekStart)}</span>
            {isCurrent ? <span className="p-chip p-chip-now">Esta semana</span> : null}
          </p>
          <button type="button" className="p-btn p-btn-ghost p-btn-icon" aria-label="Semana siguiente" disabled={offset >= 1} onClick={() => setOffset(offset + 1)}>
            <Chevron direction="right" />
          </button>
          {isCurrent ? null : (
            <button type="button" className="p-btn p-btn-ghost" onClick={() => setOffset(0)}>
              Esta semana
            </button>
          )}
        </div>
        <div className="p-actions">
          <button ref={importButton} type="button" className="p-btn p-btn-ghost" disabled={agendaBusy} onClick={() => fileInput.current?.click()}>
            {agendaBusy ? 'Leyendo el PDF…' : 'Importar agenda (PDF)'}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            className="visually-hidden"
            tabIndex={-1}
            aria-label="Archivo PDF de la agenda"
            onChange={(e) => void readAgenda(e.target.files?.[0])}
          />
          {editing === null ? (
            <button
              ref={newButton}
              type="button"
              className="p-btn p-btn-primary"
              onClick={() => {
                returnFocus.current = 'new';
                setEditing('new');
              }}
            >
              Nueva tarea
            </button>
          ) : null}
        </div>
      </div>

      {agendaError ? <FormError>{agendaError}</FormError> : null}
      {agendaDone ? (
        <p className="p-status" role="status">
          {agendaDone}
        </p>
      ) : null}
      {agenda ? (
        <AgendaImport
          preview={agenda}
          api={api}
          onDone={agendaImported}
          onCancel={() => {
            setAgenda(null);
            importButton.current?.focus();
          }}
        />
      ) : null}

      {editing !== null ? (
        <TaskForm
          key={editing === 'new' ? 'new' : editing.id}
          initial={editing === 'new' ? undefined : editing}
          defaultDate={isCurrent ? today : weekStart}
          onSubmit={saveForm}
          onCancel={() => setEditing(null)}
        />
      ) : null}

      {groups.length === 0 ? (
        <p className="p-empty">No hay tareas esta semana</p>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="p-card" aria-labelledby={`group-${g.key}`}>
            <h3 id={`group-${g.key}`} className="p-day">
              {g.title}
            </h3>
            <ul className="p-tasks">
              {g.tasks.map((t) => (
                <TaskRow key={t.id} task={t} days={days} busy={busy === t.id} confirming={confirming === t.id} message={messages[t.id]} actions={actionsFor(t)} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

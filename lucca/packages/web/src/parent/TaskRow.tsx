import { useEffect, useRef } from 'react';
import type { IsoDate, Task } from '@lucca/shared';
import { dayLong, dueLabel, subjectName } from '../i18n';

const STATUS_LABEL = { todo: 'Por hacer', doing: 'Haciendo', done: 'Lista' } as const;
const SOURCE_LABEL = { mereb: 'Mereb', photo: 'Foto', manual: 'Manual' } as const;

/** «Lunes 16» (el día de la semana va primero y con mayúscula). */
export function dayHeading(date: IsoDate): string {
  const [y, m, d] = date.split('-').map(Number);
  const name = dayLong('es', new Date(Date.UTC(y, m - 1, d)).getUTCDay());
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${d}`;
}

export interface RowActions {
  toggleDone(): void;
  toggleHidden(): void;
  edit(): void;
  preview?(): void;
  move(date: IsoDate): void;
  askDelete(): void;
  confirmDelete(): void;
  cancelDelete(): void;
}

interface Props {
  task: Task;
  days: IsoDate[];
  busy: boolean;
  confirming: boolean;
  message?: string;
  actions: RowActions;
}

export function TaskRow({ task, days, busy, confirming, message, actions }: Props) {
  const done = task.status === 'done';
  const title = task.title;
  const cancel = useRef<HTMLButtonElement>(null);
  // Al abrir la pregunta de borrado el foco va a la opción segura ("Cancelar"): con el teclado, Enter no borra por accidente.
  useEffect(() => {
    if (confirming) cancel.current?.focus();
  }, [confirming]);
  return (
    <li className={task.hidden ? 'p-task p-task-hidden' : 'p-task'}>
      <div className="p-task-main">
        <div className="p-chips">
          <span className="p-subject">{task.subjectLabel || subjectName('es', task.subject)}</span>
          <span className={`p-chip p-chip-${task.status}`}>{STATUS_LABEL[task.status]}</span>
          <span className="p-chip">{SOURCE_LABEL[task.source]}</span>
          {task.hidden ? <span className="p-chip p-chip-hidden">Oculta</span> : null}
          {task.dueDate ? <span className="p-due">{dueLabel('es', task.dueDate)}</span> : null}
        </div>
        <p className="p-task-title">{title}</p>
      </div>
      <div className="p-task-actions">
        <button type="button" className="p-btn p-btn-ghost p-btn-sm" disabled={busy} aria-label={`${done ? 'Marcar por hacer' : 'Marcar lista'}: ${title}`} onClick={actions.toggleDone}>
          {done ? 'Marcar por hacer' : 'Marcar lista'}
        </button>
        <button type="button" className="p-btn p-btn-ghost p-btn-sm" disabled={busy} aria-label={`${task.hidden ? 'Mostrar' : 'Ocultar'}: ${title}`} onClick={actions.toggleHidden}>
          {task.hidden ? 'Mostrar' : 'Ocultar'}
        </button>
        <button id={`edit-${task.id}`} type="button" className="p-btn p-btn-ghost p-btn-sm" disabled={busy} aria-label={`Editar: ${title}`} onClick={actions.edit}>
          Editar
        </button>
        {actions.preview ? (
          <button type="button" className="p-btn p-btn-ghost p-btn-sm" aria-label={`Ver lección: ${title}`} onClick={actions.preview}>
            Ver lección
          </button>
        ) : null}
        <select
          className="p-move"
          aria-label={`Mover a otro día: ${title}`}
          disabled={busy}
          value=""
          onChange={(e) => e.target.value && actions.move(e.target.value)}
        >
          <option value="">Mover a…</option>
          {days.map((d) => (
            <option key={d} value={d}>
              {dayHeading(d)}
            </option>
          ))}
        </select>
        <button id={`delete-${task.id}`} type="button" className="p-btn p-btn-danger p-btn-sm" disabled={busy} aria-label={`Borrar: ${title}`} onClick={actions.askDelete}>
          Borrar
        </button>
      </div>
      {confirming ? (
        <div className="p-confirm" onKeyDown={(e) => e.key === 'Escape' && actions.cancelDelete()}>
          <p>
            {task.source === 'manual'
              ? 'Se borrará del todo. No se puede deshacer.'
              : `Esta tarea vino de ${SOURCE_LABEL[task.source]}: se retirará y no volverá a aparecer.`}
          </p>
          <div className="p-actions">
            <button type="button" className="p-btn p-btn-danger" disabled={busy} onClick={actions.confirmDelete}>
              Sí, borrar
            </button>
            <button ref={cancel} type="button" className="p-btn p-btn-ghost" onClick={actions.cancelDelete}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
      {message ? (
        <p className="p-error" role="alert">
          {message}
        </p>
      ) : null}
    </li>
  );
}

import { useId } from 'react';
import { taskTitle, type DayTask, type Lang, type Task } from '@lucca/shared';
import { dueLabel, subjectName, t, type MessageKey } from '../i18n';
import { PlayIcon, SpeakerIcon, SubjectIcon } from './SubjectIcon';

const STATUS_LABEL: Record<DayTask['task']['status'], MessageKey> = {
  todo: 'statusTodo',
  doing: 'statusDoing',
  done: 'statusDone',
};
const CTA_LABEL: Record<DayTask['task']['status'], MessageKey> = { todo: 'start', doing: 'continue', done: 'review' };

interface TaskCardProps {
  item: DayTask;
  lang: Lang;
  showSpeaker: boolean;
  onOpen(): void;
  onListen(): void;
}

/** Nombre de la materia: el de Lucca en su idioma; si es "Otra", el que escribió el colegio. */
export function subjectLabelOf(task: Task, lang: Lang): string {
  const { subject, subjectLabel } = task;
  return subject === 'other' && subjectLabel ? subjectLabel : subjectName(lang, subject);
}

export function TaskCard({ item, lang, showSpeaker, onOpen, onListen }: TaskCardProps) {
  const titleId = useId();
  const { task } = item;
  const title = taskTitle(task, lang);
  const cta = t(lang, CTA_LABEL[task.status]);

  return (
    <article className="task-card" style={{ '--c': `var(--subj-${task.subject})` } as React.CSSProperties} aria-labelledby={titleId}>
      <div className="task-top">
        <div className="task-icon">
          <SubjectIcon subject={task.subject} />
        </div>
        <span className="pill">{t(lang, STATUS_LABEL[task.status])}</span>
      </div>
      <div className="task-body">
        <span className="task-subject">{subjectLabelOf(task, lang)}</span>
        <h3 className="task-title" id={titleId}>
          {title}
        </h3>
        <div className="task-meta">
          {item.urgent ? <span className="pill pill-urgent">{t(lang, 'urgent')}</span> : null}
          {item.dueDate ? <span className="task-due">{dueLabel(lang, item.dueDate)}</span> : null}
        </div>
      </div>
      <div className="task-actions">
        {showSpeaker ? (
          <button type="button" className="btn-icon" aria-label={t(lang, 'listenTask', { title })} onClick={onListen}>
            <SpeakerIcon />
          </button>
        ) : null}
        <button type="button" className="btn-primary" aria-label={`${cta}: ${title}`} onClick={onOpen}>
          <PlayIcon />
          <span>{cta}</span>
        </button>
      </div>
    </article>
  );
}

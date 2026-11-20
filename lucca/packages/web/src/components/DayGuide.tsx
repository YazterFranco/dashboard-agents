import { Celebration } from './Celebration';
import { useEffect, useRef, useState } from 'react';
import { taskTitle, type Lang, type ProgressKind, type Task, type VoiceMode } from '@lucca/shared';
import { dueLabel, t } from '../i18n';
import type { ProgressResult } from '../progress';
import { sentences } from '../speech';
import { shouldAutoSpeak, showSpeakerButtons, type Speaker } from '../speaker';
import { SpeakerIcon, SubjectIcon } from './SubjectIcon';
import { subjectLabelOf } from './TaskCard';

interface DayGuideProps {
  lang: Lang;
  voiceMode: VoiceMode;
  speaker: Speaker;
  /** Todas las tareas, siempre al día: la guía toma de aquí el título y el estado actuales. */
  tasks: Task[];
  /** La cola con la que empezó la guía (ya ordenada). */
  initialIds: string[];
  /** Si el día no tiene nada pendiente, el mensaje que se muestra en lugar de la guía. */
  emptyMessage: string | null;
  onProgress(taskId: string, kind: ProgressKind): Promise<ProgressResult>;
  onBack(): void;
}

/** "Guíame": recorre las tareas pendientes del día de una en una, sin prisa y sin regaños. */
export function DayGuide({ lang, voiceMode, speaker, tasks, initialIds, emptyMessage, onProgress, onBack }: DayGuideProps) {
  const [queue, setQueue] = useState<string[]>(initialIds);
  const [total] = useState(initialIds.length);
  const [earned, setEarned] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const reading = useRef(false);

  // Una tarea que ya está lista (otra pestaña, papá) o que desapareció se omite sin romper la guía.
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const live = queue.filter((id) => {
    const task = byId.get(id);
    return task !== undefined && task.status !== 'done' && !task.hidden && !task.retired;
  });
  const current = live.length > 0 ? byId.get(live[0]) : undefined;
  const finished = total > 0 && live.length === 0;
  const doneCount = total - live.length;
  const step = Math.min(doneCount + 1, total);
  const stepLabel = t(lang, 'guideStep', { n: String(step), m: String(total) });
  const speakers = showSpeakerButtons(voiceMode);

  const readAloud = (text: string) => {
    reading.current = true;
    speaker.speak([{ text, lang }], {
      onEnd: () => {
        reading.current = false;
      },
    });
  };
  const stepText = current
    ? sentences([stepLabel, subjectLabelOf(current, lang), taskTitle(current, lang)])
    : '';
  const toggleReading = () => {
    if (speaker.speaking && reading.current) {
      speaker.stop();
      reading.current = false;
    } else {
      readAloud(stepText);
    }
  };

  useEffect(() => () => speaker.stop(), [speaker]);

  const currentId = current?.id;
  useEffect(() => {
    heading.current?.focus();
    if (currentId && shouldAutoSpeak(voiceMode)) readAloud(stepText);
  }, [currentId]);

  useEffect(() => {
    if (finished && shouldAutoSpeak(voiceMode)) {
      readAloud(sentences([t(lang, 'guideFinished'), t(lang, 'guideStarsEarned', { n: String(earned) })]));
    }
  }, [finished]);

  const markDone = async () => {
    if (busy || !current) return;
    const id = current.id;
    setBusy(true);
    setFailed(false);
    const result = await onProgress(id, 'task_done');
    setBusy(false);
    if (result.ok) {
      setEarned((n) => n + result.starsGained);
      setQueue((q) => q.filter((queued) => queued !== id));
    } else {
      setFailed(true);
    }
  };

  const later = () => {
    if (live.length < 2) return;
    setFailed(false);
    setQueue([...live.slice(1), live[0]]);
  };

  const back = (
    <button type="button" className="seg-btn plan-back" onClick={onBack}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14.5 5.5 8 12l6.5 6.5" />
      </svg>
      <span>{t(lang, 'guideBack')}</span>
    </button>
  );

  if (total === 0) {
    return (
      <main className="guide">
        <header className="guide-top">{back}</header>
        <section className="tile guide-end">
          <h1 ref={heading} tabIndex={-1}>
            {emptyMessage ?? t(lang, 'freeDay')}
          </h1>
        </section>
      </main>
    );
  }

  if (finished) {
    return (
      <main className="guide">
        <header className="guide-top">{back}</header>
        <section className="tile guide-end celebrate">
          <Celebration />
          <h1 ref={heading} tabIndex={-1}>
            {t(lang, 'guideFinished')}
          </h1>
          <p className="guide-stars">{t(lang, 'guideStarsEarned', { n: String(earned) })}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="guide">
      <header className="guide-top">
        {back}
        <p className="guide-step">{stepLabel}</p>
      </header>
      {current ? (
        <article className="guide-card" style={{ '--c': `var(--subj-${current.subject})` } as React.CSSProperties}>
          <div className="task-icon guide-icon">
            <SubjectIcon subject={current.subject} size={44} />
          </div>
          <span className="task-subject">{subjectLabelOf(current, lang)}</span>
          <h1 ref={heading} tabIndex={-1}>
            {taskTitle(current, lang)}
          </h1>
          {current.dueDate ? <p className="task-due">{dueLabel(lang, current.dueDate)}</p> : null}
          <div className="guide-dots" aria-hidden="true">
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={`dot${i < doneCount ? ' on' : ''}`} />
            ))}
          </div>
          {failed ? (
            <p className="guide-error" role="status">
              {t(lang, 'guideRetry')}
            </p>
          ) : null}
          <div className="guide-actions">
            {speakers ? (
              <button type="button" className="btn-icon" aria-label={t(lang, 'listenTask', { title: taskTitle(current, lang) })} onClick={toggleReading}>
                <SpeakerIcon />
              </button>
            ) : null}
            <button type="button" className="btn-primary" disabled={busy} onClick={markDone}>
              {t(lang, 'guideDone')}
            </button>
            <button type="button" className="seg-btn guide-later" disabled={busy || live.length < 2} onClick={later}>
              {t(lang, 'guideLater')}
            </button>
          </div>
        </article>
      ) : null}
    </main>
  );
}

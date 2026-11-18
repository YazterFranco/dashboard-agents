import { useEffect, useRef } from 'react';
import { dayTasks, suggestedStart, taskTitle, weekSummary, weekTotals, weekdayOf, type IsoDate, type Lang, type Task } from '@lucca/shared';
import { dayLong, dayShort, t, weekProgressText, type MessageKey } from '../i18n';
import { ProgressBar } from './ProgressBar';
import { CheckIcon, SubjectIcon } from './SubjectIcon';

interface WeekPlanProps {
  lang: Lang;
  /** Los cinco días de la semana que se está viendo. */
  days: IsoDate[];
  tasks: Task[];
  /** El día en que Lucca "está" (en fin de semana, el lunes siguiente): ahí se adelantan las atrasadas. */
  today: IsoDate;
  /** La fecha real de hoy. */
  realToday: IsoDate;
  range: string;
  onGoToDay(date: IsoDate): void;
  onBack(): void;
}

const STATUS_LABEL: Record<Task['status'], MessageKey> = { todo: 'statusTodo', doing: 'statusDoing', done: 'statusDone' };
const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const dayNumber = (date: IsoDate): number => Number(date.slice(8, 10));

/** Plan de la semana: cada día con sus tareas y por dónde empezar. */
export function WeekPlan({ lang, days, tasks, today, realToday, range, onGoToDay, onBack }: WeekPlanProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  const summaries = weekSummary(tasks, days, today);
  const totals = weekTotals(summaries);
  const start = suggestedStart(summaries, today);

  let startMessage: string;
  if (totals.total === 0) startMessage = t(lang, 'weekNone');
  else if (start === null) startMessage = t(lang, 'planAllDone');
  else if (start === realToday) startMessage = t(lang, 'planStartToday');
  else startMessage = t(lang, 'planStartDay', { day: dayLong(lang, weekdayOf(start)) });

  return (
    <main className="plan">
      <header className="tile plan-head">
        <button type="button" className="seg-btn plan-back" onClick={onBack}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14.5 5.5 8 12l6.5 6.5" />
          </svg>
          <span>{t(lang, 'guideBack')}</span>
        </button>
        <h1 ref={heading} tabIndex={-1}>
          {t(lang, 'planOpen')}
        </h1>
        <p className="plan-range">{range}</p>
        <p className="plan-start">{startMessage}</p>
        {totals.total > 0 ? (
          <div className="plan-progress">
            <p className="week-progress-text">{weekProgressText(lang, totals.done, totals.total)}</p>
            <ProgressBar label={weekProgressText(lang, totals.done, totals.total)} done={totals.done} total={totals.total} />
          </div>
        ) : null}
      </header>

      <ol className="plan-days">
        {days.map((date) => {
          const wd = weekdayOf(date);
          const items = dayTasks(tasks, date, today);
          return (
            <li key={date}>
              <button
                type="button"
                className="plan-day"
                aria-label={t(lang, 'planGoToDay', { day: `${capitalize(dayLong(lang, wd))} ${dayNumber(date)}` })}
                onClick={() => onGoToDay(date)}
              >
                <span className="plan-day-head" aria-hidden="true">
                  <span className="plan-day-name">{dayShort(lang, wd)}</span>
                  <span className="plan-day-num">{dayNumber(date)}</span>
                </span>
                <span className="plan-chips">
                  {items.length === 0 ? <span className="chip-empty">{t(lang, 'planFreeDay')}</span> : null}
                  {items.map(({ task }) => (
                    <span key={task.id} className="chip" style={{ '--c': `var(--subj-${task.subject})` } as React.CSSProperties}>
                      <span className="chip-icon">
                        <SubjectIcon subject={task.subject} size={18} />
                      </span>
                      <span className="chip-title">{taskTitle(task, lang)}</span>
                      <span className="chip-status">
                        {task.status === 'done' ? <CheckIcon size={14} /> : null}
                        {t(lang, STATUS_LABEL[task.status])}
                      </span>
                    </span>
                  ))}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </main>
  );
}

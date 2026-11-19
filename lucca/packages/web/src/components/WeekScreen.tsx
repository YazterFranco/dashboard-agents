import { useEffect, useRef, useState } from 'react';
import {
  dayTasks,
  defaultDayOf,
  guideOrder,
  mondayOf,
  plannerToday,
  shiftWeek,
  taskTitle,
  weekDays,
  weekSummary,
  weekTotals,
  type IsoDate,
  type KidState,
  type ProgressKind,
} from '@lucca/shared';
import { subjectName, summaryLine, t, weekProgressText, weekRange } from '../i18n';
import type { Prefs } from '../prefs';
import type { ProgressResult } from '../progress';
import { sentences } from '../speech';
import { shouldAutoSpeak, showSpeakerButtons, type Speaker } from '../speaker';
import { Controls } from './Controls';
import { DayGuide } from './DayGuide';
import { DayStrip } from './DayStrip';
import { Mascot } from './Mascot';
import { ProgressBar } from './ProgressBar';
import { StarsTile } from './StarsTile';
import { LockIcon, SpeakerIcon } from './SubjectIcon';
import { TaskCard, subjectLabelOf } from './TaskCard';
import { WeekNav } from './WeekNav';
import { WeekPlan } from './WeekPlan';

interface WeekScreenProps {
  state: KidState;
  prefs: Prefs;
  speaker: Speaker;
  onPrefs(p: Prefs): void;
  onOpenTask(id: string): void;
  /** Envía un avance al servidor; la guía del día lo usa para marcar tareas. */
  onProgress(taskId: string, kind: ProgressKind): Promise<ProgressResult>;
}

export function WeekScreen({ state, prefs, speaker, onPrefs, onOpenTask, onProgress }: WeekScreenProps) {
  const { lang } = prefs;
  const today = plannerToday(state.today);
  const [weekStart, setWeekStart] = useState<IsoDate>(mondayOf(today));
  const [selected, setSelected] = useState<IsoDate>(today);
  const [view, setView] = useState<'week' | 'plan' | 'guide'>('week');
  const [guideIds, setGuideIds] = useState<string[]>([]);
  const planButton = useRef<HTMLButtonElement>(null);
  const guideButton = useRef<HTMLButtonElement>(null);
  /** Al volver de una vista, el foco regresa al botón que la abrió. */
  const returnFocus = useRef<'plan' | 'guide' | null>(null);
  const days = weekDays(weekStart);
  const summaries = weekSummary(state.tasks, days, today);
  const totals = weekTotals(summaries);
  const isCurrentWeek = weekStart === mondayOf(today);
  const range = weekRange(lang, weekStart);
  const progressText = weekProgressText(lang, totals.done, totals.total);
  /** El navegador solo deja hablar después de un toque: el primero "arma" la lectura automática. */
  const armed = useRef(false);
  /** Qué botón inició la lectura en curso: pulsarlo otra vez la detiene. */
  const playing = useRef<string | null>(null);

  const startSpeaking = (key: string, text: string) => {
    playing.current = key;
    speaker.speak([{ text, lang }], {
      onEnd: () => {
        if (playing.current === key) playing.current = null;
      },
    });
  };
  const toggleSpeaking = (key: string, text: string) => {
    if (speaker.speaking && playing.current === key) {
      speaker.stop();
      playing.current = null;
    } else {
      startSpeaking(key, text);
    }
  };

  const describe = (date: IsoDate) => {
    const items = dayTasks(state.tasks, date, today);
    const pending = items.filter((i) => i.task.status !== 'done');
    const focus = pending.find((i) => i.task.status === 'doing') ?? pending[0];
    const summary = summaryLine(lang, { isToday: date === state.today, date, pending: pending.length, total: items.length });
    const suggestion =
      items.length === 0
        ? null
        : focus
          ? t(lang, 'mascotSuggest', { subject: subjectName(lang, focus.task.subject) })
          : t(lang, 'mascotAllDone');
    return { items, summary, suggestion };
  };

  const dayText = (date: IsoDate): string => {
    const { summary, suggestion } = describe(date);
    return sentences([summary.replace(' · ', '. '), suggestion]);
  };

  useEffect(() => {
    if (view !== 'week' || !returnFocus.current) return;
    (returnFocus.current === 'plan' ? planButton : guideButton).current?.focus();
    returnFocus.current = null;
  }, [view]);

  const openPlan = () => {
    returnFocus.current = 'plan';
    setView('plan');
  };

  const goToWeek = (monday: IsoDate) => {
    setWeekStart(monday);
    setSelected(defaultDayOf(monday, state.tasks, today));
  };

  const onFirstTouch = () => {
    if (armed.current) return;
    armed.current = true;
    if (shouldAutoSpeak(prefs.voiceMode)) startSpeaking('nova', dayText(selected));
  };

  const selectDay = (date: IsoDate) => {
    setSelected(date);
    if (armed.current && shouldAutoSpeak(prefs.voiceMode)) startSpeaking('nova', dayText(date));
  };

  const { items, summary, suggestion } = describe(selected);
  const pendingCount = items.filter((i) => i.task.status !== 'done').length;

  const openGuide = () => {
    setGuideIds(guideOrder(items).map((i) => i.task.id));
    returnFocus.current = 'guide';
    setView('guide');
  };
  const speakers = showSpeakerButtons(prefs.voiceMode);
  const hasAgenda = state.tasks.length > 0;

  if (view === 'guide') {
    return (
      <DayGuide
        lang={lang}
        voiceMode={prefs.voiceMode}
        speaker={speaker}
        tasks={state.tasks}
        initialIds={guideIds}
        emptyMessage={items.length === 0 ? t(lang, 'freeDay') : pendingCount === 0 ? t(lang, 'mascotAllDone') : null}
        onProgress={onProgress}
        onBack={() => setView('week')}
      />
    );
  }

  if (view === 'plan') {
    return (
      <WeekPlan
        lang={lang}
        days={days}
        tasks={state.tasks}
        today={today}
        realToday={state.today}
        range={range}
        onGoToDay={(date) => {
          setSelected(date);
          setView('week');
        }}
        onBack={() => setView('week')}
      />
    );
  }

  return (
    <main className={`bento${hasAgenda ? '' : ' bento-empty'}`} onPointerDownCapture={onFirstTouch}>
      <section className="tile hello-tile">
        <Mascot />
        <div className="hello-text">
          <h1>{t(lang, 'hello', { name: state.settings.childName })}</h1>
          {hasAgenda ? (
            <>
              <p className="summary">{summary}</p>
              {suggestion ? <p className="suggestion">{suggestion}</p> : null}
            </>
          ) : (
            <p className="suggestion">{t(lang, 'noAgenda')}</p>
          )}
          {hasAgenda ? (
            <div className="hello-actions">
              {speakers ? (
                <button type="button" className="btn-icon btn-nova" aria-label={t(lang, 'listenMascot')} onClick={() => toggleSpeaking('nova', dayText(selected))}>
                  <SpeakerIcon />
                </button>
              ) : null}
              <button ref={guideButton} type="button" className="btn-primary btn-guide" onClick={openGuide}>
                {t(lang, 'guideStart')}
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {hasAgenda ? (
        <section className="tile week-tile">
          <div className="week-head">
            <h2>{t(lang, 'week')}</h2>
            <WeekNav
              lang={lang}
              range={range}
              isCurrent={isCurrentWeek}
              onPrev={() => goToWeek(shiftWeek(weekStart, -1))}
              onNext={() => goToWeek(shiftWeek(weekStart, 1))}
              onCurrent={() => goToWeek(mondayOf(today))}
            />
          </div>
          <DayStrip days={summaries} selected={selected} today={state.today} lang={lang} onSelect={selectDay} />
          <div className="week-progress">
            {totals.total === 0 ? (
              <p className="week-progress-text">{t(lang, 'weekNone')}</p>
            ) : (
              <>
                <p className="week-progress-text">{progressText}</p>
                <ProgressBar label={progressText} done={totals.done} total={totals.total} />
                {speakers ? (
                  <button
                    type="button"
                    className="btn-icon btn-chip"
                    aria-label={t(lang, 'listenTask', { title: progressText })}
                    onClick={() => toggleSpeaking('week', sentences([range, progressText]))}
                  >
                    <SpeakerIcon />
                  </button>
                ) : null}
              </>
            )}
            <button ref={planButton} type="button" className="seg-btn plan-open" onClick={openPlan}>
              {t(lang, 'planOpen')}
            </button>
          </div>
        </section>
      ) : null}

      {hasAgenda ? (
        <section className="tasks" aria-label={t(lang, 'week')}>
          {items.length === 0 ? (
            <div className="free-day">
              <p>{t(lang, 'freeDay')}</p>
            </div>
          ) : (
            items.map((item) => (
              <TaskCard
                key={item.task.id}
                item={item}
                lang={lang}
                showSpeaker={speakers}
                onOpen={() => onOpenTask(item.task.id)}
                onListen={() => toggleSpeaking(item.task.id, `${subjectLabelOf(item.task, lang)}. ${taskTitle(item.task, lang)}`)}
              />
            ))
          )}
        </section>
      ) : null}

      <aside className="side">
        <StarsTile count={state.starsThisWeek} lang={lang} />
        <Controls prefs={prefs} onPrefs={onPrefs} />
        <a className="seg-btn parent-link" href="/papa">
          <LockIcon />
          <span>{t(lang, 'parentArea')}</span>
        </a>
      </aside>
    </main>
  );
}

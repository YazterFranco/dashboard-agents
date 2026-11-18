import { useRef, useState } from 'react';
import { dayTasks, plannerToday, taskTitle, weekDays, weekSummary, type IsoDate, type KidState, type ProgressKind } from '@lucca/shared';
import { subjectName, summaryLine, t } from '../i18n';
import type { Prefs } from '../prefs';
import type { ProgressResult } from '../progress';
import { shouldAutoSpeak, showSpeakerButtons, type Speaker } from '../speaker';
import { Controls } from './Controls';
import { DayStrip } from './DayStrip';
import { Mascot } from './Mascot';
import { StarsTile } from './StarsTile';
import { SpeakerIcon } from './SubjectIcon';
import { TaskCard, subjectLabelOf } from './TaskCard';

interface WeekScreenProps {
  state: KidState;
  prefs: Prefs;
  speaker: Speaker;
  onPrefs(p: Prefs): void;
  onOpenTask(id: string): void;
  /** Envía un avance al servidor; la guía del día lo usa para marcar tareas. */
  onProgress(taskId: string, kind: ProgressKind): Promise<ProgressResult>;
}

/** Une frases para leerlas en voz alta: cada una termina en un signo de puntuación. */
function sentences(parts: (string | null)[]): string {
  return parts
    .filter((p): p is string => Boolean(p))
    .map((p) => (/[.!?…]$/.test(p.trim()) ? p.trim() : `${p.trim()}.`))
    .join(' ');
}

export function WeekScreen({ state, prefs, speaker, onPrefs, onOpenTask }: WeekScreenProps) {
  const { lang } = prefs;
  const today = plannerToday(state.today);
  const days = weekDays(today);
  const [selected, setSelected] = useState<IsoDate>(today);
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
  const speakers = showSpeakerButtons(prefs.voiceMode);
  const hasAgenda = state.tasks.length > 0;

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
          {speakers && hasAgenda ? (
            <button type="button" className="btn-icon btn-nova" aria-label={t(lang, 'listenMascot')} onClick={() => toggleSpeaking('nova', dayText(selected))}>
              <SpeakerIcon />
            </button>
          ) : null}
        </div>
      </section>

      {hasAgenda ? (
        <section className="tile week-tile">
          <h2>{t(lang, 'week')}</h2>
          <DayStrip days={weekSummary(state.tasks, days, today)} selected={selected} today={state.today} lang={lang} onSelect={selectDay} />
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
                onListen={() => toggleSpeaking(item.task.id, `${subjectLabelOf(item, lang)}. ${taskTitle(item.task, lang)}`)}
              />
            ))
          )}
        </section>
      ) : null}

      <aside className="side">
        <StarsTile count={state.starsThisWeek} lang={lang} />
        <Controls prefs={prefs} onPrefs={onPrefs} />
      </aside>
    </main>
  );
}

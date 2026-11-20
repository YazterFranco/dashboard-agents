import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LessonPlayer } from './lesson/LessonPlayer';
import { fetchLesson } from './lesson/api';
import { ReviewPlayer } from './review/ReviewPlayer';
import { reviewApi } from './review/api';
import { PracticePlayer } from './practice/PracticePlayer';
import { fetchPractice } from './practice/api';
import { PauseGate } from './pause';
import { SettingsSchema, type KidState, type ProgressKind, type Settings } from '@lucca/shared';
import { fetchState, postProgress } from './api';
import { Mascot } from './components/Mascot';
import { WeekScreen } from './components/WeekScreen';
import { t } from './i18n';
import { changedPrefs, loadPrefs, savePrefs, type Prefs } from './prefs';
import type { ProgressResult } from './progress';
import { createSpeaker } from './speaker';

const FALLBACK: Prefs = { lang: SettingsSchema.parse({}).lang, voiceMode: 'both', theme: 'dark' };

const fromSettings = (s: Settings): Prefs => ({ lang: s.lang, voiceMode: s.voiceMode, theme: s.theme });

export function App() {
  const [state, setState] = useState<KidState | null>(null);
  const [failed, setFailed] = useState(false);
  /** Tarea abierta en «Entender»; la semana sigue montada (oculta) para volver al mismo día. */
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [practiceTaskId, setPracticeTaskId] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs(FALLBACK));
  // La velocidad de la voz la elige papá (0,7 a 1,2); mientras no llegan los ajustes se usa 0,9.
  const speechRate = state?.settings.speechRate ?? 0.9;
  const speaker = useMemo(() => createSpeaker(typeof speechSynthesis === 'undefined' ? undefined : speechSynthesis, speechRate), [speechRate]);
  const firstLoad = useRef(true);
  /** El último estado, para calcular cuántas estrellas ganó un avance sin depender del orden de los renders. */
  const stateRef = useRef<KidState | null>(null);

  const commit = useCallback((next: KidState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const load = useCallback(() => {
    fetchState()
      .then((s) => {
        commit(s);
        setFailed(false);
        // Lo que Lucca eligió en este dispositivo manda; si no eligió nada, valen los ajustes de papá.
        if (firstLoad.current) {
          firstLoad.current = false;
          setPrefs(loadPrefs(fromSettings(s.settings)));
        }
      })
      .catch(() => setFailed(true));
  }, [commit]);

  /** Envía un avance. Solo si el servidor lo acepta cambia el estado y las estrellas; si falla, nada cambia. */
  const onProgress = useCallback(
    async (taskId: string, kind: ProgressKind): Promise<ProgressResult> => {
      try {
        const answer = await postProgress(taskId, kind);
        const prev = stateRef.current;
        if (!prev) return { ok: true, starsGained: 0 };
        commit({
          ...prev,
          starsThisWeek: answer.starsThisWeek,
          tasks: prev.tasks.map((t) => (t.id === taskId ? { ...t, status: answer.status } : t)),
          understood: kind === 'lesson_done' && !prev.understood.includes(taskId) ? [...prev.understood, taskId] : prev.understood,
        });
        return { ok: true, starsGained: Math.max(0, answer.starsThisWeek - prev.starsThisWeek) };
      } catch {
        return { ok: false };
      }
    },
    [commit],
  );

  useEffect(load, [load]);

  // Una tablet que se queda abierta toda la noche debe mostrar el día correcto al volver a mirarla.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'hidden') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme;
    document.documentElement.lang = prefs.lang;
  }, [prefs.theme, prefs.lang]);

  const onPrefs = (next: Prefs) => {
    speaker.stop();
    setPrefs(next);
    savePrefs(changedPrefs(prefs, next));
  };

  const openTask = state && openTaskId ? state.tasks.find((t) => t.id === openTaskId) : undefined;
  const practiceTask = state && practiceTaskId ? state.tasks.find((t) => t.id === practiceTaskId) : undefined;
  const openLesson = (id: string) => {
    opener.current = document.activeElement as HTMLElement | null;
    speaker.stop();
    setOpenTaskId(id);
  };
  const closeLesson = () => {
    setOpenTaskId(null);
    // Al volver, el foco regresa al botón que abrió la lección.
    requestAnimationFrame(() => opener.current?.focus());
  };

  if (state) {
    return (
      <PauseGate minutes={state.settings.pauseMinutes} lang={prefs.lang}>
        <div className="week-wrap" hidden={Boolean(openTask) || reviewing || Boolean(practiceTask)}>
          <WeekScreen
            key={state.today}
            state={state}
            prefs={prefs}
            speaker={speaker}
            onPrefs={onPrefs}
            onOpenTask={openLesson}
            onProgress={onProgress}
            onPractice={(id) => {
              opener.current = document.activeElement as HTMLElement | null;
              speaker.stop();
              setPracticeTaskId(id);
            }}
            onOpenReview={() => {
              opener.current = document.activeElement as HTMLElement | null;
              speaker.stop();
              setReviewing(true);
            }}
          />
        </div>
        {practiceTask ? (
          <PracticePlayer
            key={practiceTask.id}
            task={practiceTask}
            lang={prefs.lang}
            voiceMode={prefs.voiceMode}
            speaker={speaker}
            load={() => fetchPractice(practiceTask.id)}
            onProgress={onProgress}
            onClose={() => {
              setPracticeTaskId(null);
              requestAnimationFrame(() => opener.current?.focus());
            }}
          />
        ) : null}
        {reviewing ? (
          <ReviewPlayer
            lang={prefs.lang}
            voiceMode={prefs.voiceMode}
            speaker={speaker}
            api={reviewApi}
            onClose={() => {
              setReviewing(false);
              // Las estrellas y lo que queda por repasar cambian: se vuelve a pedir el estado.
              load();
              requestAnimationFrame(() => opener.current?.focus());
            }}
          />
        ) : null}
        {openTask ? (
          <LessonPlayer
            key={openTask.id}
            task={openTask}
            lang={prefs.lang}
            voiceMode={prefs.voiceMode}
            speaker={speaker}
            load={(variant) => fetchLesson(openTask.id, variant)}
            onProgress={onProgress}
            onClose={closeLesson}
          />
        ) : null}
      </PauseGate>
    );
  }

  return (
    <main className="splash">
      <Mascot size={140} />
      <p className="splash-text">{t(prefs.lang, failed ? 'offline' : 'loading')}</p>
      {failed ? (
        <button type="button" className="btn-primary splash-retry" onClick={load}>
          {t(prefs.lang, 'retry')}
        </button>
      ) : null}
    </main>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { taskTitle, type Lang, type LessonDoc, type ProgressKind, type Task, type VoiceMode } from '@lucca/shared';
import { t } from '../i18n';
import type { ProgressResult } from '../progress';
import { shouldAutoSpeak, showSpeakerButtons, type Segment, type Speaker } from '../speaker';
import { Mascot } from '../components/Mascot';
import { SpeakerIcon } from '../components/SubjectIcon';
import { LessonBlock, blockSpeech } from './Blocks';
import type { LessonAnswer, LessonVariant } from './api';
import { T, voiceOf } from './text';

interface Props {
  task: Task;
  /** Idioma de la interfaz de Lucca. */
  lang: Lang;
  voiceMode: VoiceMode;
  speaker: Speaker;
  load(variant: LessonVariant): Promise<LessonAnswer>;
  /** Sin esto (vista previa de papá) nada cuenta como progreso. */
  onProgress?(taskId: string, kind: ProgressKind): Promise<ProgressResult>;
  onClose(): void;
  /** Texto del botón de salir (Lucca: «Volver a mi semana»; papá: «Cerrar la vista previa»). */
  closeLabel?: string;
}

type View =
  | { kind: 'loading' }
  | { kind: 'unavailable'; reason: 'no-ai' | 'cap' | 'slow' | 'offline' }
  | { kind: 'lesson'; doc: LessonDoc; variant: LessonVariant };

/** Inglés se ve en inglés y Español en español; lo demás, en el idioma de Lucca. */
export const defaultContentLang = (task: Task, lang: Lang): Lang => (task.subject === 'english' ? 'en' : task.subject === 'spanish' ? 'es' : lang);

const Back = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14.5 5.5 8 12l6.5 6.5" />
  </svg>
);

/** «Entender»: una idea por pantalla, preguntas al final, otra explicación cuando hace falta y una estrella al terminar. */
export function LessonPlayer({ task, lang, voiceMode, speaker, load, onProgress, onClose, closeLabel }: Props) {
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [index, setIndex] = useState(0);
  const [contentLang, setContentLang] = useState<Lang>(() => defaultContentLang(task, lang));
  const [solved, setSolved] = useState<Record<number, boolean>>({});
  const [misses, setMisses] = useState<Record<number, number>>({});
  const [finished, setFinished] = useState<{ star: boolean } | null>(null);
  const [altFailed, setAltFailed] = useState(false);
  const stepSent = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);

  const [altLoading, setAltLoading] = useState(false);

  const showLesson = (doc: LessonDoc, variant: LessonVariant) => {
    setView({ kind: 'lesson', doc, variant });
    setIndex(0);
    setSolved({});
    setMisses({});
  };

  // `load` puede cambiar en cada render (la semana se actualiza al marcar avance): se usa siempre la última sin
  // volver a cargar la lección, que solo se pide al abrirla.
  const loadRef = useRef(load);
  loadRef.current = load;

  const open = useCallback(async () => {
    setView({ kind: 'loading' });
    try {
      const answer = await loadRef.current('default');
      if (answer.status === 'ready') showLesson(answer.lesson.doc, 'default');
      else setView({ kind: 'unavailable', reason: answer.reason });
    } catch {
      setView({ kind: 'unavailable', reason: 'offline' });
    }
  }, []);

  /** La otra explicación se pide sin quitar la lección actual: si no llega, Lucca sigue donde estaba. */
  const anotherWay = async () => {
    speaker.stop();
    setAltFailed(false);
    setAltLoading(true);
    try {
      const answer = await loadRef.current('alternative');
      if (answer.status === 'ready') showLesson(answer.lesson.doc, 'alternative');
      else setAltFailed(true);
    } catch {
      setAltFailed(true);
    } finally {
      setAltLoading(false);
    }
  };

  useEffect(() => {
    void open();
    return () => speaker.stop();
  }, [open, speaker]);

  const doc = view.kind === 'lesson' ? view.doc : null;
  const screens = doc?.screens.length ?? 0;
  const total = screens + (doc?.quiz.length ?? 0);
  const inQuiz = doc !== null && index >= screens;
  const blocks = doc ? (inQuiz ? [doc.quiz[index - screens]] : doc.screens[index].blocks) : [];

  const speech = (): Segment[] =>
    blocks.flatMap((b) => {
      if (b.type === 'explain') return voiceOf(b.text, contentLang);
      if (b.type === 'story') return b.panels.flatMap((p) => voiceOf(p.text, contentLang));
      return blockSpeech(b, contentLang).map((text) => ({ text, lang: contentLang }));
    });

  useEffect(() => {
    if (!doc || finished) return;
    heading.current?.focus();
    if (shouldAutoSpeak(voiceMode)) speaker.speak(speech());
  }, [doc, index, contentLang, finished]);

  const next = async () => {
    if (!doc) return;
    if (index === 0 && !stepSent.current && onProgress) {
      stepSent.current = true;
      void onProgress(task.id, 'lesson_step');
    }
    if (index < total - 1) {
      speaker.stop();
      setIndex(index + 1);
      return;
    }
    speaker.stop();
    const result = onProgress ? await onProgress(task.id, 'lesson_done') : null;
    setFinished({ star: Boolean(result && result.ok && result.starsGained > 0) });
  };

  const back = (
    <button type="button" className="seg-btn plan-back" onClick={onClose}>
      <Back />
      <span>{closeLabel ?? t(lang, 'guideBack')}</span>
    </button>
  );

  if (view.kind === 'loading') {
    return (
      <main className="lesson">
        <header className="guide-top">{back}</header>
        <section className="tile lesson-wait">
          <Mascot size={120} />
          <p role="status">{t(lang, 'lessonPreparing')}</p>
        </section>
      </main>
    );
  }

  if (view.kind === 'unavailable') {
    const message = view.reason === 'slow' ? 'lessonSlow' : view.reason === 'offline' ? 'lessonOffline' : 'lessonWithDad';
    return (
      <main className="lesson">
        <header className="guide-top">{back}</header>
        <section className="tile lesson-wait">
          <Mascot size={120} />
          <p role="status">{t(lang, message)}</p>
          {view.reason === 'slow' || view.reason === 'offline' ? (
            <button type="button" className="btn-primary lesson-retry" onClick={() => void open()}>
              {t(lang, 'retry')}
            </button>
          ) : null}
        </section>
      </main>
    );
  }

  if (finished) {
    return (
      <main className="lesson">
        <header className="guide-top">{back}</header>
        <section className="tile guide-end">
          <Mascot size={120} />
          <h1 ref={heading} tabIndex={-1}>
            {t(lang, 'lessonDone')}
          </h1>
          {finished.star ? <p className="guide-stars">⭐ {t(lang, 'lessonStar')}</p> : null}
        </section>
      </main>
    );
  }

  const canGoOn = !inQuiz || solved[index];
  const offer = inQuiz && (misses[index] ?? 0) >= 2 && !solved[index] && view.variant === 'default';
  const otherLang: Lang = contentLang === 'en' ? 'es' : 'en';

  return (
    <main className="lesson" style={{ '--c': `var(--subj-${task.subject})` } as React.CSSProperties}>
      <header className="guide-top">
        {back}
        <p className="guide-step">{t(lang, 'lessonStep', { n: String(index + 1), m: String(total) })}</p>
      </header>
      <article className="tile lesson-card" lang={contentLang}>
        <div className="lesson-head">
          <h1 ref={heading} tabIndex={-1} className="lesson-title">
            {doc ? <T text={doc.title} lang={contentLang} /> : taskTitle(task, lang)}
          </h1>
          <div className="lesson-tools">
            {showSpeakerButtons(voiceMode) ? (
              <button type="button" className="btn-icon btn-nova" aria-label={t(lang, 'lessonListen')} onClick={() => speaker.speak(speech())}>
                <SpeakerIcon />
              </button>
            ) : null}
            <button type="button" className="seg-btn lesson-lang" lang={otherLang} onClick={() => setContentLang(otherLang)}>
              {otherLang === 'es' ? '¿Me lo dices en español?' : 'Tell me in English?'}
            </button>
          </div>
        </div>
        <div className="bar lesson-bar" role="progressbar" aria-label={t(lang, 'lessonStep', { n: String(index + 1), m: String(total) })} aria-valuemin={1} aria-valuemax={total} aria-valuenow={index + 1}>
          <span style={{ width: `${Math.round(((index + 1) / total) * 100)}%` }} />
        </div>
        {inQuiz ? <p className="lesson-quiz-label">{t(lang, 'lessonQuiz', { n: String(index - screens + 1), m: String(total - screens) })}</p> : null}
        <div className="lesson-blocks" key={`${view.variant}-${index}-${contentLang}`}>
          {blocks.map((b, i) => (
            <LessonBlock
              key={i}
              block={b}
              lang={contentLang}
              onSolved={() => setSolved((s) => ({ ...s, [index]: true }))}
              onMiss={() => setMisses((m) => ({ ...m, [index]: (m[index] ?? 0) + 1 }))}
            />
          ))}
        </div>
        {offer ? (
          <div className="lesson-offer" role="status">
            <Mascot size={64} />
            <p>{t(lang, 'lessonOfferOtherWay')}</p>
            <button type="button" className="btn-primary" onClick={() => void anotherWay()}>
              {t(lang, 'lessonYes')}
            </button>
          </div>
        ) : null}
        {altLoading ? (
          <p className="lesson-feedback" role="status">
            {t(lang, 'lessonPreparing')}
          </p>
        ) : null}
        {altFailed ? (
          <p className="lesson-feedback" role="status">
            {t(lang, 'lessonWithDad')}
          </p>
        ) : null}
      </article>
      <nav className="lesson-nav" aria-label={t(lang, 'lessonStep', { n: String(index + 1), m: String(total) })}>
        <button type="button" className="seg-btn lesson-prev" disabled={index === 0} onClick={() => setIndex(index - 1)}>
          {t(lang, 'lessonBack')}
        </button>
        {view.variant === 'default' ? (
          <button type="button" className="seg-btn lesson-other" disabled={altLoading} onClick={() => void anotherWay()}>
            {t(lang, 'lessonOtherWay')}
          </button>
        ) : null}
        <button type="button" className="btn-primary lesson-next" disabled={!canGoOn} onClick={() => void next()}>
          {index === total - 1 ? t(lang, 'lessonFinish') : t(lang, 'lessonNext')}
        </button>
      </nav>
    </main>
  );
}

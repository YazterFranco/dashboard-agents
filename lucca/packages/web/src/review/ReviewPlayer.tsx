import { useEffect, useRef, useState } from 'react';
import type { Lang, VoiceMode } from '@lucca/shared';
import { t } from '../i18n';
import { Mascot } from '../components/Mascot';
import { LessonBlock, blockSpeech } from '../lesson/Blocks';
import { SayContext } from '../lesson/text';
import { shouldAutoSpeak, showSpeakerButtons, type Speaker } from '../speaker';
import type { ReviewApi, ReviewItemView } from './api';

interface Props {
  lang: Lang;
  voiceMode: VoiceMode;
  speaker: Speaker;
  api: ReviewApi;
  onClose(): void;
}

type View = { kind: 'loading' } | { kind: 'offline' } | { kind: 'empty' } | { kind: 'review'; items: ReviewItemView[] } | { kind: 'done'; star: boolean };

/** Inglés en inglés y Español en español, como en la lección. */
const contentLang = (item: ReviewItemView, lang: Lang): Lang => (item.subject === 'english' ? 'en' : item.subject === 'spanish' ? 'es' : lang);

/** «Repaso rápido»: unas pocas preguntas de lecciones pasadas. Lo que se recuerda a la primera sube de caja. */
export function ReviewPlayer({ lang, voiceMode, speaker, api, onClose }: Props) {
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [index, setIndex] = useState(0);
  const [solved, setSolved] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Preguntas ya contestadas: solo cuenta el primer intento (acertar a la primera = lo recuerda). */
  const answered = useRef(new Set<string>());
  const heading = useRef<HTMLHeadingElement>(null);

  const load = async () => {
    setView({ kind: 'loading' });
    try {
      const r = await api.today();
      setView(r.items.length ? { kind: 'review', items: r.items } : { kind: 'empty' });
      setIndex(0);
      setSolved(false);
    } catch {
      setView({ kind: 'offline' });
    }
  };

  useEffect(() => {
    void load();
    return () => speaker.stop();
  }, []);

  const item = view.kind === 'review' ? view.items[index] : null;
  const itemLang = item ? contentLang(item, lang) : lang;

  useEffect(() => {
    if (!item) return;
    heading.current?.focus();
    if (shouldAutoSpeak(voiceMode)) speaker.speak(blockSpeech(item.question, itemLang).map((text) => ({ text, lang: itemLang })));
  }, [item?.id]);

  const record = (correct: boolean) => {
    if (!item || answered.current.has(item.id)) return;
    answered.current.add(item.id);
    void api.answer(item.id, correct).catch(() => undefined);
  };

  const next = async () => {
    if (view.kind !== 'review') return;
    speaker.stop();
    if (index < view.items.length - 1) {
      setIndex(index + 1);
      setSolved(false);
      return;
    }
    setBusy(true);
    try {
      const r = await api.finish();
      setView({ kind: 'done', star: r.starGained });
    } catch {
      setView({ kind: 'done', star: false });
    } finally {
      setBusy(false);
    }
  };

  const back = (
    <button type="button" className="seg-btn plan-back" onClick={onClose}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14.5 5.5 8 12l6.5 6.5" />
      </svg>
      <span>{t(lang, 'guideBack')}</span>
    </button>
  );

  if (view.kind !== 'review') {
    const message = view.kind === 'loading' ? 'loading' : view.kind === 'offline' ? 'reviewOffline' : view.kind === 'empty' ? 'reviewNone' : null;
    return (
      <main className="lesson">
        <header className="guide-top">{back}</header>
        <section className="tile guide-end">
          <Mascot size={120} />
          {view.kind === 'done' ? (
            <>
              <h1 ref={heading} tabIndex={-1}>
                {t(lang, 'reviewDone')}
              </h1>
              <p className="lesson-wait-text">{t(lang, 'reviewDoneText')}</p>
              {view.star ? <p className="guide-stars">⭐ {t(lang, 'lessonStar')}</p> : null}
            </>
          ) : (
            <p className="lesson-wait-text" role="status">
              {t(lang, message!)}
            </p>
          )}
          {view.kind === 'offline' ? (
            <button type="button" className="btn-primary lesson-retry" onClick={() => void load()}>
              {t(lang, 'retry')}
            </button>
          ) : null}
        </section>
      </main>
    );
  }

  const total = view.items.length;
  const last = index === total - 1;
  return (
    <main className="lesson" style={{ '--c': `var(--subj-${item!.subject})` } as React.CSSProperties}>
      <header className="guide-top">
        {back}
        <p className="guide-step">{t(lang, 'lessonQuiz', { n: String(index + 1), m: String(total) })}</p>
      </header>
      <article className="tile lesson-card" lang={itemLang}>
        <div className="lesson-head">
          <h1 ref={heading} tabIndex={-1} className="lesson-title">
            {t(lang, 'reviewOpen')}
          </h1>
          <p className="lesson-quiz-label">{item!.taskTitle}</p>
        </div>
        <SayContext.Provider value={showSpeakerButtons(voiceMode) ? (segments) => speaker.speak(segments) : null}>
          <div className="lesson-blocks" key={item!.id}>
            <LessonBlock
              block={item!.question}
              lang={itemLang}
              onSolved={() => {
                record(true);
                setSolved(true);
              }}
              onMiss={() => record(false)}
            />
          </div>
        </SayContext.Provider>
      </article>
      <nav className="lesson-nav" aria-label={t(lang, 'reviewOpen')}>
        <button type="button" className="btn-primary lesson-next" disabled={!solved || busy} onClick={() => void next()}>
          {last ? t(lang, 'lessonFinish') : t(lang, 'lessonNext')}
        </button>
      </nav>
    </main>
  );
}

import { useEffect, useRef, useState } from 'react';
import { SESSION_LENGTH, START, adapt, pickItem, type AdaptState, type Lang, type PracticeItem, type ProgressKind, type Task, type VoiceMode } from '@lucca/shared';
import { t } from '../i18n';
import type { ProgressResult } from '../progress';
import { shouldAutoSpeak, showSpeakerButtons, type Speaker } from '../speaker';
import { Mascot } from '../components/Mascot';
import { Celebration } from '../components/Celebration';
import { LessonBlock, blockSpeech } from '../lesson/Blocks';
import { defaultContentLang } from '../lesson/LessonPlayer';
import { SayContext } from '../lesson/text';
import type { PracticeAnswer } from './api';

interface Props {
  task: Task;
  lang: Lang;
  voiceMode: VoiceMode;
  speaker: Speaker;
  load(): Promise<PracticeAnswer>;
  onProgress?(taskId: string, kind: ProgressKind): Promise<ProgressResult>;
  onClose(): void;
}

type View = { kind: 'loading' } | { kind: 'unavailable'; reason: 'no-ai' | 'cap' | 'slow' | 'offline' } | { kind: 'playing' } | { kind: 'done'; star: boolean; saveFailed?: boolean };

/**
 * «Practicar»: 6 retos que empiezan fáciles; dos aciertos a la primera suben de nivel y dos fallos bajan.
 * Equivocarse nunca quita nada: se puede volver a intentar y sale una pista si la hay.
 */
export function PracticePlayer({ task, lang, voiceMode, speaker, load, onProgress, onClose }: Props) {
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [bank, setBank] = useState<PracticeItem[]>([]);
  const [state, setState] = useState<AdaptState>(START);
  const [item, setItem] = useState<PracticeItem | null>(null);
  const [index, setIndex] = useState(0);
  const [solved, setSolved] = useState(false);
  const [missed, setMissed] = useState(false);
  const [results, setResults] = useState<boolean[]>([]);
  const [levelNote, setLevelNote] = useState<'up' | 'down' | null>(null);
  const used = useRef(new Set<string>());
  const heading = useRef<HTMLHeadingElement>(null);
  const contentLang = defaultContentLang(task, lang);
  const total = SESSION_LENGTH;

  const begin = (items: PracticeItem[]) => {
    used.current = new Set();
    const first = pickItem(items, START.level, used.current);
    if (first) used.current.add(first.id);
    setState(START);
    setItem(first);
    setIndex(0);
    setSolved(false);
    setMissed(false);
    setResults([]);
    setLevelNote(null);
    setView({ kind: 'playing' });
  };

  const open = async () => {
    setView({ kind: 'loading' });
    try {
      const answer = await load();
      if (answer.status === 'ready' && answer.items.length) {
        setBank(answer.items);
        begin(answer.items);
      } else setView({ kind: 'unavailable', reason: answer.status === 'ready' ? 'no-ai' : answer.reason });
    } catch {
      setView({ kind: 'unavailable', reason: 'offline' });
    }
  };

  useEffect(() => {
    void open();
    return () => speaker.stop();
  }, []);

  useEffect(() => {
    if (!item || view.kind !== 'playing') return;
    heading.current?.focus();
    if (shouldAutoSpeak(voiceMode)) speaker.speak(blockSpeech(item.block, contentLang).map((text) => ({ text, lang: contentLang })));
  }, [item?.id, index]);

  const onSolved = () => {
    if (solved) return;
    setSolved(true);
    const firstTry = !missed;
    const next = adapt(state, firstTry);
    setLevelNote(next.level > state.level ? 'up' : next.level < state.level ? 'down' : null);
    setState(next);
    setResults((r) => [...r, firstTry]);
  };

  const next = async () => {
    speaker.stop();
    if (index < total - 1) {
      const nextItem = pickItem(bank, state.level, used.current, item?.block.type);
      if (nextItem) used.current.add(nextItem.id);
      setItem(nextItem);
      setIndex(index + 1);
      setSolved(false);
      setMissed(false);
      setLevelNote(null);
      return;
    }
    await saveDone();
  };

  const saveDone = async () => {
    const result = onProgress ? await onProgress(task.id, 'practice_done') : null;
    setView({ kind: 'done', star: Boolean(result && result.ok && result.starsGained > 0), saveFailed: Boolean(result && !result.ok) });
  };

  const back = (
    <button type="button" className="seg-btn plan-back" onClick={onClose}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14.5 5.5 8 12l6.5 6.5" />
      </svg>
      <span>{t(lang, 'guideBack')}</span>
    </button>
  );

  if (view.kind === 'loading' || view.kind === 'unavailable') {
    const message = view.kind === 'loading' ? 'loading' : view.reason === 'offline' ? 'lessonOffline' : view.reason === 'slow' ? 'lessonSlow' : 'lessonWithDad';
    return (
      <main className="lesson">
        <header className="guide-top">{back}</header>
        <section className="tile lesson-wait">
          <Mascot size={120} />
          <p role="status">{t(lang, message)}</p>
          {view.kind === 'unavailable' && (view.reason === 'offline' || view.reason === 'slow') ? (
            <button type="button" className="btn-primary lesson-retry" onClick={() => void open()}>
              {t(lang, 'retry')}
            </button>
          ) : null}
        </section>
      </main>
    );
  }

  if (view.kind === 'done') {
    const firstTries = results.filter(Boolean).length;
    return (
      <main className="lesson">
        <header className="guide-top">{back}</header>
        <section className="tile guide-end celebrate">
          <Celebration />
          <Mascot size={120} />
          <h1 ref={heading} tabIndex={-1}>
            {t(lang, 'practiceDone')}
          </h1>
          <p className="lesson-wait-text">{t(lang, 'practiceSummary', { m: String(results.length), n: String(firstTries) })}</p>
          {view.star ? <p className="guide-stars">⭐ {t(lang, 'lessonStar')}</p> : null}
          {view.saveFailed ? (
            <>
              <p className="lesson-wait-text" role="status">
                {t(lang, 'saveFailed')}
              </p>
              <button type="button" className="btn-primary lesson-retry" onClick={() => void saveDone()}>
                {t(lang, 'retry')}
              </button>
            </>
          ) : null}
          <button type="button" className="btn-primary lesson-retry" onClick={() => begin(bank)}>
            {t(lang, 'practiceAgain')}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="lesson" style={{ '--c': `var(--subj-${task.subject})` } as React.CSSProperties}>
      <header className="guide-top">
        {back}
        <p className="guide-step">{t(lang, 'practiceStep', { n: String(index + 1), m: String(total) })}</p>
      </header>
      <article className="tile lesson-card" lang={contentLang}>
        <div className="lesson-head">
          <h1 ref={heading} tabIndex={-1} className="lesson-title">
            {t(lang, 'practiceOpen')}
          </h1>
          <p className="practice-level" aria-label={t(lang, 'practiceLevel', { n: String(state.level) })}>
            <span aria-hidden="true">{'★'.repeat(state.level)}{'☆'.repeat(3 - state.level)}</span>
            <span>{t(lang, 'practiceLevel', { n: String(state.level) })}</span>
          </p>
        </div>
        <p className="lesson-quiz-label">{task.title}</p>
        {item ? (
          <SayContext.Provider value={showSpeakerButtons(voiceMode) ? (segments) => speaker.speak(segments) : null}>
            <div className="lesson-blocks" key={`${index}-${item.id}`}>
              <LessonBlock block={item.block} lang={contentLang} onSolved={onSolved} onMiss={() => setMissed(true)} />
            </div>
          </SayContext.Provider>
        ) : null}
        {levelNote ? (
          <p className="practice-note" role="status">
            {t(lang, levelNote === 'up' ? 'practiceUp' : 'practiceEasier')}
          </p>
        ) : null}
      </article>
      <nav className="lesson-nav" aria-label={t(lang, 'practiceOpen')}>
        <button type="button" className="btn-primary lesson-next" disabled={!solved} onClick={() => void next()}>
          {index === total - 1 ? t(lang, 'lessonFinish') : t(lang, 'lessonNext')}
        </button>
      </nav>
    </main>
  );
}

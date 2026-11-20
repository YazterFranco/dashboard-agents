import { useMemo, useState } from 'react';
import type { BiText, Block, Lang } from '@lucca/shared';
import { t } from '../i18n';
import { SayText, T, plain, shuffled } from './text';

type Of<K extends Block['type']> = Extract<Block, { type: K }>;

export interface BlockEvents {
  /** El bloque quedó resuelto (todas las respuestas correctas). */
  onSolved?(): void;
  /** Una respuesta equivocada (para ofrecer otra explicación tras dos fallos). */
  onMiss?(): void;
}
interface Props<K extends Block['type']> extends BlockEvents {
  block: Of<K>;
  lang: Lang;
}

type FeedbackState = 'right' | 'kept-trying' | 'wrong' | null;

/** Elogio del proceso, no del talento: «lo pensaste bien», o «seguiste intentando» si hubo fallos antes. */
function Feedback({ state, lang, hint }: { state: FeedbackState; lang: Lang; hint?: BiText }) {
  const text = state === 'right' ? t(lang, 'lessonRight') : state === 'kept-trying' ? t(lang, 'lessonKeptTrying') : state === 'wrong' ? t(lang, 'lessonTryAgain') : '';
  return (
    <>
      <p className={`lesson-feedback${state ? ` is-${state === 'wrong' ? 'wrong' : 'right'}` : ''}`} role="status">
        {text}
      </p>
      {state === 'wrong' && hint ? (
        <p className="lesson-hint">
          <span aria-hidden="true">💡 </span>
          <strong>{t(lang, 'lessonHint')}:</strong> <T text={hint} lang={lang} />
        </p>
      ) : null}
    </>
  );
}
const outcome = (solved: boolean, missed: boolean, everMissed: boolean): FeedbackState =>
  solved ? (everMissed ? 'kept-trying' : 'right') : missed ? 'wrong' : null;

const Emoji = ({ value, size = 'big' }: { value?: string; size?: 'big' | 'small' }) =>
  value ? (
    <span className={`lesson-emoji lesson-emoji-${size}`} aria-hidden="true">
      {value}
    </span>
  ) : null;

/** Respuesta única entre opciones (choice, fillWord, trueFalse, count): se puede reintentar; lo fallado se apaga. */
function useSingleAnswer(events: BlockEvents) {
  const [wrong, setWrong] = useState<number[]>([]);
  const [solved, setSolved] = useState(false);
  const pick = (index: number, correct: boolean) => {
    if (solved || wrong.includes(index)) return;
    if (correct) {
      setSolved(true);
      events.onSolved?.();
    } else {
      setWrong((w) => [...w, index]);
      events.onMiss?.();
    }
  };
  const state = outcome(solved, wrong.length > 0, wrong.length > 0);
  return { wrong, solved, pick, state };
}

function Options({ labels, correct, lang, events, emojis, hint }: { labels: React.ReactNode[]; correct: number; lang: Lang; events: BlockEvents; emojis?: (string | undefined)[]; hint?: BiText }) {
  const { wrong, solved, pick, state } = useSingleAnswer(events);
  return (
    <>
      <div className="lesson-options">
        {labels.map((label, i) => (
          <button
            key={i}
            type="button"
            className={`lesson-option${solved && i === correct ? ' is-right' : ''}${wrong.includes(i) ? ' is-wrong' : ''}`}
            disabled={(solved && i !== correct) || wrong.includes(i)}
            aria-pressed={solved && i === correct}
            onClick={() => pick(i, i === correct)}
          >
            <Emoji value={emojis?.[i]} size="small" />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <Feedback state={state} lang={lang} hint={hint} />
    </>
  );
}

export function ExplainBlock({ block, lang }: Props<'explain'>) {
  return (
    <div className="lesson-explain">
      <Emoji value={block.emoji} />
      <SayText text={block.text} lang={lang} />
    </div>
  );
}

export function StoryBlock({ block, lang }: Props<'story'>) {
  return (
    <ol className="lesson-story">
      {block.panels.map((p, i) => (
        <li key={i}>
          <Emoji value={p.emoji} size="small" />
          <SayText text={p.text} lang={lang} />
        </li>
      ))}
    </ol>
  );
}

export function ChoiceBlock({ block, lang, ...events }: Props<'choice'>) {
  return (
    <div className="lesson-question">
      <SayText text={block.question} lang={lang} />
      <Options labels={block.options.map((o, i) => <T key={i} text={o.text} lang={lang} />)} emojis={block.options.map((o) => o.emoji)} correct={block.correct} lang={lang} events={events} hint={block.hint} />
    </div>
  );
}

export function FillWordBlock({ block, lang, ...events }: Props<'fillWord'>) {
  return (
    <div className="lesson-question">
      <SayText text={block.sentence} lang={lang} className="lesson-text lesson-fill" />
      <Options labels={block.options.map((o, i) => <T key={i} text={o} lang={lang} />)} correct={block.correct} lang={lang} events={events} hint={block.hint} />
    </div>
  );
}

export function TrueFalseBlock({ block, lang, ...events }: Props<'trueFalse'>) {
  return (
    <div className="lesson-question">
      <SayText text={block.statement} lang={lang} />
      <Options labels={[t(lang, 'lessonTrue'), t(lang, 'lessonFalse')]} emojis={['👍', '👎']} correct={block.answer ? 0 : 1} lang={lang} events={events} hint={block.hint} />
    </div>
  );
}

/** Tres números para elegir: el correcto y sus vecinos (nunca menos de 1). */
export function countChoices(amount: number): number[] {
  const start = Math.max(1, amount - 1);
  return [start, start + 1, start + 2];
}

export function CountBlock({ block, lang, ...events }: Props<'count'>) {
  const choices = countChoices(block.amount);
  return (
    <div className="lesson-question">
      <SayText text={block.question} lang={lang} />
      <div className="lesson-count" role="group" aria-label={plain(block.question, lang)}>
        {Array.from({ length: block.amount }, (_, i) => (
          <span key={i} role="img" aria-label={block.emoji}>
            {block.emoji}
          </span>
        ))}
      </div>
      <Options labels={choices.map(String)} correct={choices.indexOf(block.amount)} lang={lang} events={events} hint={block.hint} />
    </div>
  );
}

export function NumberLineBlock({ block, lang, ...events }: Props<'numberLine'>) {
  const numbers = Array.from({ length: block.max - block.min + 1 }, (_, i) => block.min + i);
  const { wrong, solved, pick, state } = useSingleAnswer(events);
  return (
    <div className="lesson-question">
      <SayText text={block.question} lang={lang} />
      <div className="lesson-line" role="group" aria-label={plain(block.question, lang)}>
        {numbers.map((n) => (
          <button
            key={n}
            type="button"
            className={`lesson-tick${solved && n === block.answer ? ' is-right' : ''}${wrong.includes(n) ? ' is-wrong' : ''}`}
            disabled={wrong.includes(n) || (solved && n !== block.answer)}
            onClick={() => pick(n, n === block.answer)}
          >
            {n}
          </button>
        ))}
      </div>
      <Feedback state={state} lang={lang} />
    </div>
  );
}

export function OrderBlock({ block, lang, ...events }: Props<'order'>) {
  const offered = useMemo(() => shuffled(block.items.map((_, i) => i), plain(block.question, 'es')), [block]);
  const [chosen, setChosen] = useState<number[]>([]);
  const [missed, setMissed] = useState(false);
  const [everMissed, setEverMissed] = useState(false);
  const solved = chosen.length === block.items.length;
  const tap = (index: number) => {
    if (solved || chosen.includes(index)) return;
    if (index === chosen.length) {
      const next = [...chosen, index];
      setChosen(next);
      setMissed(false);
      if (next.length === block.items.length) events.onSolved?.();
    } else {
      setMissed(true);
      setEverMissed(true);
      events.onMiss?.();
    }
  };
  return (
    <div className="lesson-question">
      <SayText text={block.question} lang={lang} />
      <div className="lesson-options">
        {offered.map((i) => (
          <button key={i} type="button" className={`lesson-option${chosen.includes(i) ? ' is-right' : ''}`} disabled={chosen.includes(i)} onClick={() => tap(i)}>
            <span>
              <T text={block.items[i]} lang={lang} />
            </span>
          </button>
        ))}
      </div>
      {chosen.length ? (
        <ol className="lesson-chosen" aria-label={t(lang, 'lessonChosen')}>
          {chosen.map((i) => (
            <li key={i}>
              <T text={block.items[i]} lang={lang} />
            </li>
          ))}
        </ol>
      ) : null}
      <Feedback state={outcome(solved, missed, everMissed)} lang={lang} />
    </div>
  );
}

export function MatchBlock({ block, lang, ...events }: Props<'match'>) {
  const rights = useMemo(() => shuffled(block.pairs.map((_, i) => i), plain(block.question, 'en')), [block]);
  const [left, setLeft] = useState<number | null>(null);
  const [done, setDone] = useState<number[]>([]);
  const [missed, setMissed] = useState(false);
  const [everMissed, setEverMissed] = useState(false);
  const solved = done.length === block.pairs.length;
  const pickRight = (i: number) => {
    if (left === null || done.includes(i)) return;
    if (i === left) {
      const next = [...done, i];
      setDone(next);
      setMissed(false);
      if (next.length === block.pairs.length) events.onSolved?.();
    } else {
      setMissed(true);
      setEverMissed(true);
      events.onMiss?.();
    }
    setLeft(null);
  };
  return (
    <div className="lesson-question">
      <SayText text={block.question} lang={lang} />
      <div className="lesson-match">
        <div className="lesson-options lesson-col">
          {block.pairs.map((p, i) => (
            <button key={i} type="button" className={`lesson-option${done.includes(i) ? ' is-right' : ''}`} aria-pressed={left === i} disabled={done.includes(i)} onClick={() => setLeft(i)}>
              <span>
                <T text={p.left} lang={lang} />
              </span>
            </button>
          ))}
        </div>
        <div className="lesson-options lesson-col">
          {rights.map((i) => (
            <button key={i} type="button" className={`lesson-option${done.includes(i) ? ' is-right' : ''}`} disabled={done.includes(i) || left === null} onClick={() => pickRight(i)}>
              <span>
                <T text={block.pairs[i].right} lang={lang} />
              </span>
            </button>
          ))}
        </div>
      </div>
      <Feedback state={outcome(solved, missed, everMissed)} lang={lang} />
    </div>
  );
}

export function SortBlock({ block, lang, ...events }: Props<'sort'>) {
  const [index, setIndex] = useState(0);
  const [missed, setMissed] = useState(false);
  const [everMissed, setEverMissed] = useState(false);
  const solved = index >= block.items.length;
  const item = block.items[Math.min(index, block.items.length - 1)];
  const pick = (group: number) => {
    if (solved) return;
    if (group === item.group) {
      setMissed(false);
      setIndex(index + 1);
      if (index + 1 === block.items.length) events.onSolved?.();
    } else {
      setMissed(true);
      setEverMissed(true);
      events.onMiss?.();
    }
  };
  return (
    <div className="lesson-question">
      <SayText text={block.question} lang={lang} />
      {solved ? null : (
        <p className="lesson-sort-item">
          <Emoji value={item.emoji} size="small" />
          <span>{t(lang, 'lessonNextItem', { item: plain(item.text, lang) })}</span>
        </p>
      )}
      <div className="lesson-options">
        {block.groups.map((g, i) => (
          <button key={i} type="button" className="lesson-option" disabled={solved} onClick={() => pick(i)}>
            <span>
              <T text={g} lang={lang} />
            </span>
          </button>
        ))}
      </div>
      <Feedback state={outcome(solved, missed, everMissed)} lang={lang} />
    </div>
  );
}

/** Dibuja cualquier bloque del catálogo. */
export function LessonBlock({ block, lang, ...events }: { block: Block; lang: Lang } & BlockEvents) {
  switch (block.type) {
    case 'explain':
      return <ExplainBlock block={block} lang={lang} />;
    case 'story':
      return <StoryBlock block={block} lang={lang} />;
    case 'choice':
      return <ChoiceBlock block={block} lang={lang} {...events} />;
    case 'fillWord':
      return <FillWordBlock block={block} lang={lang} {...events} />;
    case 'trueFalse':
      return <TrueFalseBlock block={block} lang={lang} {...events} />;
    case 'count':
      return <CountBlock block={block} lang={lang} {...events} />;
    case 'numberLine':
      return <NumberLineBlock block={block} lang={lang} {...events} />;
    case 'order':
      return <OrderBlock block={block} lang={lang} {...events} />;
    case 'match':
      return <MatchBlock block={block} lang={lang} {...events} />;
    case 'sort':
      return <SortBlock block={block} lang={lang} {...events} />;
  }
}

/** Texto de un bloque para leerlo en voz alta. */
export function blockSpeech(block: Block, lang: Lang): string[] {
  switch (block.type) {
    case 'explain':
      return [plain(block.text, lang)];
    case 'story':
      return block.panels.map((p) => plain(p.text, lang));
    case 'choice':
      return [plain(block.question, lang), ...block.options.map((o) => plain(o.text, lang))];
    case 'fillWord':
      return [plain(block.sentence, lang).replace(/_{2,}/g, '…'), ...block.options.map((o) => plain(o, lang))];
    case 'trueFalse':
      return [plain(block.statement, lang)];
    case 'count':
    case 'numberLine':
      return [plain(block.question, lang)];
    case 'order':
    case 'match':
    case 'sort':
      return [plain(block.question, lang)];
  }
}

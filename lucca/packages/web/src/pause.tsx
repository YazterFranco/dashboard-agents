import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Lang } from '@lucca/shared';
import { t } from './i18n';
import { Mascot } from './components/Mascot';

const TICK_MS = 15_000;
const BREAK_SECONDS = 5 * 60;

/**
 * Pausa saludable (child-safety): tras `minutes` de uso con la pantalla visible, la mascota propone 5 minutos para
 * estirarse y tomar agua. Se puede saltar en cualquier momento: sin presión ni castigos. Lo de detrás queda inerte (sin
 * perder dónde estaba Lucca). `0` = sin recordatorio.
 */
export function PauseGate({ minutes, lang, children }: { minutes: number; lang: Lang; children: ReactNode }) {
  const used = useRef(0);
  const [pausing, setPausing] = useState(false);
  const [left, setLeft] = useState(BREAK_SECONDS);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!minutes || pausing) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      used.current += TICK_MS;
      if (used.current >= minutes * 60_000) {
        setLeft(BREAK_SECONDS);
        setPausing(true);
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [minutes, pausing]);

  useEffect(() => {
    if (!pausing) return;
    heading.current?.focus();
    const timer = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [pausing]);

  const resume = () => {
    used.current = 0;
    setPausing(false);
  };

  return (
    <>
      <div inert={pausing || undefined}>{children}</div>
      {pausing ? (
        <div className="pause-backdrop">
          <section className="tile pause-card" role="dialog" aria-modal="true" aria-labelledby="pause-title">
            <Mascot size={110} />
            <h1 id="pause-title" ref={heading} tabIndex={-1}>
              {t(lang, 'pauseTitle')}
            </h1>
            <p className="pause-ideas" aria-hidden="true">
              🙆 💧 👀
            </p>
            <p className="lesson-wait-text">{t(lang, 'pauseText')}</p>
            <p className="pause-timer" role="timer">
              {`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}
            </p>
            <button type="button" className="btn-primary lesson-retry" onClick={resume}>
              {t(lang, left > 0 ? 'pauseSkip' : 'pauseDone')}
            </button>
          </section>
        </div>
      ) : null}
    </>
  );
}

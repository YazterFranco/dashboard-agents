import type { Lang } from '@lucca/shared';
import { t } from '../i18n';

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={direction === 'left' ? 'M14.5 5.5 8 12l6.5 6.5' : 'M9.5 5.5 16 12l-6.5 6.5'} />
    </svg>
  );
}

interface WeekNavProps {
  lang: Lang;
  range: string;
  isCurrent: boolean;
  onPrev(): void;
  onNext(): void;
  onCurrent(): void;
}

/** Elegir la semana: anterior, siguiente y volver a esta. Botones grandes; el rango dice qué semana se ve. */
export function WeekNav({ lang, range, isCurrent, onPrev, onNext, onCurrent }: WeekNavProps) {
  return (
    <div className="week-nav">
      <div className="week-nav-row">
        <button type="button" className="btn-icon btn-chip" aria-label={t(lang, 'weekPrev')} onClick={onPrev}>
          <Chevron direction="left" />
        </button>
        <p className="week-range">
          <span>{range}</span>
          {isCurrent ? <span className="pill pill-this">{t(lang, 'thisWeek')}</span> : null}
        </p>
        <button type="button" className="btn-icon btn-chip" aria-label={t(lang, 'weekNext')} onClick={onNext}>
          <Chevron direction="right" />
        </button>
      </div>
      {isCurrent ? null : (
        <button type="button" className="seg-btn week-current" onClick={onCurrent}>
          {t(lang, 'thisWeek')}
        </button>
      )}
    </div>
  );
}

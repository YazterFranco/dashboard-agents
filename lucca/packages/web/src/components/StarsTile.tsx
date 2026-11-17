import type { Lang } from '@lucca/shared';
import { t } from '../i18n';

export function StarsTile({ count, lang }: { count: number; lang: Lang }) {
  return (
    <section className="tile stars-tile">
      <div className="stars-badge" aria-hidden="true">
        <svg width="112" height="112" viewBox="0 0 120 120">
          <polygon
            points="60,8 71.39,17.5 86,14.97 91.11,28.89 105.03,34 102.5,48.61 112,60 102.5,71.39 105.03,86 91.11,91.11 86,105.03 71.39,102.5 60,112 48.61,102.5 34,105.03 28.89,91.11 14.97,86 17.5,71.39 8,60 17.5,48.61 14.97,34 28.89,28.89 34,14.97 48.61,17.5"
            fill="#FFD15C"
            stroke="#FFD15C"
            strokeWidth="10"
            strokeLinejoin="round"
          />
        </svg>
        <span className="stars-number">{count}</span>
      </div>
      <p className="stars-text">{t(lang, 'starsThisWeek')}</p>
    </section>
  );
}

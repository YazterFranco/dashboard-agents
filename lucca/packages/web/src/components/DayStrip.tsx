import { weekdayOf, type DaySummary, type IsoDate, type Lang } from '@lucca/shared';
import { dayLong, dayShort, t } from '../i18n';
import { CheckIcon } from './SubjectIcon';

interface DayStripProps {
  days: DaySummary[];
  selected: IsoDate;
  /** Fecha real de hoy; en fin de semana ningún día de la tira es hoy. */
  today: IsoDate;
  lang: Lang;
  onSelect(date: IsoDate): void;
}

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function DayStrip({ days, selected, today, lang, onSelect }: DayStripProps) {
  return (
    <nav className="day-strip" aria-label={t(lang, 'daysLabel')}>
      {days.map((d) => {
        const wd = weekdayOf(d.date);
        const num = Number(d.date.slice(8, 10));
        const isToday = d.date === today;
        const name =
          `${capitalize(dayLong(lang, wd))} ${num}` + (isToday ? `, ${t(lang, 'today')}` : '') + (d.allDone ? `, ${t(lang, 'dayDone')}` : '');
        return (
          <button
            key={d.date}
            type="button"
            className={`day-btn${isToday ? ' is-today' : ''}`}
            aria-pressed={d.date === selected}
            aria-label={name}
            onClick={() => onSelect(d.date)}
          >
            <span className="day-name" aria-hidden="true">
              {dayShort(lang, wd)}
            </span>
            <span className="day-num" aria-hidden="true">
              {num}
            </span>
            {isToday ? (
              <span className="today-pill" aria-hidden="true">
                {t(lang, 'today')}
              </span>
            ) : null}
            {d.allDone ? (
              <span className="day-done" aria-hidden="true">
                <CheckIcon />
              </span>
            ) : (
              <span className={`day-dot${d.pending > 0 ? ' has-pending' : ''}`} aria-hidden="true" />
            )}
          </button>
        );
      })}
    </nav>
  );
}

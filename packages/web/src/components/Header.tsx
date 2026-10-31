import type { ConnStatus } from '../lib/ws';
import type { PlatformFilter } from '../lib/tree';

interface Props {
  conn: ConnStatus;
  filter: PlatformFilter;
  onFilter(f: PlatformFilter): void;
  counts: Record<PlatformFilter, number>;
}

const FILTERS: Array<[PlatformFilter, string]> = [
  ['all', 'Todos'],
  ['claude', 'Claude'],
  ['kiro', 'Kiro'],
];

export function Header({ conn, filter, onFilter, counts }: Props) {
  return (
    <header className="header">
      <div className="brand">
        <span className="brand-name">AGENT·DASH</span>
        <span className={`conn conn-${conn}`} role="status">
          <span aria-hidden="true">●</span> {conn === 'live' ? 'en vivo' : 'reconectando…'}
        </span>
      </div>
      <div className="filters" role="group" aria-label="Filtrar por plataforma">
        {FILTERS.map(([value, label]) => (
          <button key={value} type="button" className={`filter filter-${value}`} aria-pressed={filter === value} onClick={() => onFilter(value)}>
            {label} · {counts[value]}
          </button>
        ))}
      </div>
    </header>
  );
}

import { STATUS_LABELS } from '@agentdash/shared/constants';
import { platformLabel } from '../lib/format';
import type { TreeRow } from '../lib/tree';

interface Props {
  rows: TreeRow[];
  selectedId: string | null;
  onSelect(id: string): void;
}

function Row({ row, selected, onSelect }: { row: TreeRow; selected: boolean; onSelect(id: string): void }) {
  const a = row.agent;
  return (
    <button type="button" className={`tree-row status-${a.status}`} style={{ marginLeft: row.depth * 20 }} aria-pressed={selected} onClick={() => onSelect(a.id)}>
      <span className="tree-line">
        <span className="tree-name">
          {row.depth > 0 ? '↳ ' : ''}
          {a.name}
        </span>
        <span className="tree-status">● {STATUS_LABELS[a.status]}</span>
      </span>
      <span className={`tree-platform platform-${a.platform}`}>
        {platformLabel(a)}
        {a.extensions.length > 0 ? ` · ${a.extensions.join(', ')}` : ''}
      </span>
    </button>
  );
}

export function FlowTree({ rows, selectedId, onSelect }: Props) {
  const firstDone = rows.findIndex((r) => r.depth === 0 && r.agent.status === 'done');
  const active = firstDone === -1 ? rows : rows.slice(0, firstDone);
  const done = firstDone === -1 ? [] : rows.slice(firstDone);
  const doneRoots = done.filter((r) => r.depth === 0).length;
  return (
    <nav className="panel tree" aria-label="Flujos de agentes">
      <h2 className="panel-title">Flujos</h2>
      {active.map((r) => (
        <Row key={r.agent.id} row={r} selected={selectedId === r.agent.id} onSelect={onSelect} />
      ))}
      {active.length === 0 && <p className="muted">Ningún agente activo.</p>}
      {done.length > 0 && (
        <details className="tree-done">
          <summary>Terminados ({doneRoots})</summary>
          {done.map((r) => (
            <Row key={r.agent.id} row={r} selected={selectedId === r.agent.id} onSelect={onSelect} />
          ))}
        </details>
      )}
    </nav>
  );
}

import { STATUS_LABELS } from '@agentdash/shared/constants';
import type { AgentState } from '@agentdash/shared';
import { bubbleText } from '../lib/format';
import { Sprite } from './Sprite';

interface Props {
  agents: AgentState[];
  selectedId: string | null;
  onSelect(id: string): void;
}

export function OfficeStrip({ agents, selectedId, onSelect }: Props) {
  if (agents.length === 0) return null;
  return (
    <section className="office" aria-label="Oficina">
      {agents.map((a) => {
        const bubble = bubbleText(a);
        return (
          <button
            key={a.id}
            type="button"
            className={`desk status-${a.status}`}
            aria-pressed={selectedId === a.id}
            aria-label={`${a.name}, ${STATUS_LABELS[a.status]}, ${bubble}`}
            onClick={() => onSelect(a.id)}
          >
            <span className="bubble" title={bubble}>
              {bubble}
            </span>
            <span className="desk-figure">
              <Sprite platform={a.platform} working={a.status === 'working'} />
              <span className="monitor" aria-hidden="true" />
            </span>
            <span className="desk-top" aria-hidden="true" />
            <span className="desk-name">{a.name}</span>
            <span className="desk-status">● {STATUS_LABELS[a.status]}</span>
          </button>
        );
      })}
    </section>
  );
}

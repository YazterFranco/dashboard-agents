import { STATUS_LABELS } from '@agentdash/shared/constants';
import type { AgentEvent, AgentState } from '@agentdash/shared';
import { compressFlow, timelineRows } from '../lib/flow';
import { clock, elapsed, platformLabel, shortToolName } from '../lib/format';

interface Props {
  agent: AgentState;
  events: AgentEvent[];
  now: number;
}

const NOW_TEXT: Record<AgentState['status'], string> = {
  working: 'Pensando…',
  waiting: 'Terminó su turno: esperando tu respuesta o un permiso.',
  error: 'La última herramienta falló.',
  done: 'Sesión terminada.',
  stale: 'Sin actividad hace más de 10 minutos.',
};

export function AgentDetail({ agent: a, events, now }: Props) {
  const flow = compressFlow(events);
  const rows = timelineRows(events).slice(0, 100);
  const runFor = (a.endedAt ?? now) - a.startedAt;
  return (
    <section className="panel detail" aria-label={`Detalle de ${a.name}`}>
      <div className="detail-head">
        <div className="detail-id">
          <h2 className="detail-name">{a.name}</h2>
          <span className="muted">
            <span className={`platform-${a.platform}`}>{platformLabel(a)}</span>
            {a.cwd ? ` · ${a.cwd}` : ''} · {elapsed(runFor)}
          </span>
          {a.title && <span className="detail-title">“{a.title}”</span>}
        </div>
        <div className="chips">
          <span className={`chip chip-status status-${a.status}`}>● {STATUS_LABELS[a.status]}</span>
          {a.extensions.map((x) => (
            <span key={x} className="chip">
              {x}
            </span>
          ))}
        </div>
      </div>

      {flow.length > 0 && (
        <div className="block">
          <span className="block-label">Flujo de esta sesión</span>
          <ol className="flow">
            {flow.map((s, i) => (
              <li key={i} className="flow-item">
                <span className={`flow-step flow-${s.state}`}>
                  {shortToolName(s.label)}
                  {s.count > 1 ? ` ×${s.count}` : ''}
                </span>
                {i < flow.length - 1 && (
                  <span className="flow-arrow" aria-hidden="true">
                    →
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="block">
        <span className="block-label">Ahora</span>
        <div className="now">
          {a.currentTool ? (
            <>
              <div className="now-tool">
                {shortToolName(a.currentTool.name)}
                {a.currentTool.summary ? ` · ${a.currentTool.summary}` : ''}
              </div>
              <div className="muted">desde hace {elapsed(now - a.currentTool.startedAt)}</div>
            </>
          ) : (
            <div className="muted">{NOW_TEXT[a.status]}</div>
          )}
        </div>
      </div>

      <div className="block">
        <span className="block-label">Timeline</span>
        {rows.length === 0 && <p className="muted">Aún no hay eventos para este agente.</p>}
        <ol className="timeline">
          {rows.map((r) => (
            <li key={r.id} className={`tl-row tone-${r.tone}`}>
              <span className="tl-time">{clock(r.ts)}</span>
              <span className="tl-label">{shortToolName(r.label)}</span>
              <span className="tl-text">{r.text ?? ''}</span>
              {r.result && <span className="tl-result">{r.result}</span>}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

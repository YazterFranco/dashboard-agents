import { useCallback, useEffect, useState } from 'react';
import { weekRange, weekProgressText } from '../i18n';
import { ProgressBar } from '../components/ProgressBar';
import { ApiError, type ParentApi, type ParentProgress } from './api';
import { plural } from './fields';

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'expired' } | { kind: 'ready'; data: ParentProgress };

const WEEKS = 4;

export function ProgressTab({ api }: { api: ParentApi }) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      setState({ kind: 'ready', data: await api.progress(WEEKS) });
    } catch (err) {
      // Un 401 ya lo atendió `ParentApp`: vuelve al PIN. Aquí no hay nada que decir.
      setState(err instanceof ApiError && err.status === 401 ? { kind: 'expired' } : { kind: 'error' });
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === 'expired') return null;
  if (state.kind === 'loading') return <p className="p-lead">Un momento…</p>;
  if (state.kind === 'error') {
    return (
      <section className="p-card" role="alert">
        <p>No se pudo cargar el progreso. Revisa que el asistente siga encendido.</p>
        <div className="p-actions">
          <button type="button" className="p-btn p-btn-primary" onClick={() => void load()}>
            Intentar de nuevo
          </button>
        </div>
      </section>
    );
  }

  const { weeks, needsHelp, review } = state.data;
  return (
    <div className="p-tab">
      {review ? (
        <section className="p-card" aria-labelledby="review-title">
          <h2 id="review-title">Repaso rápido</h2>
          {review.total === 0 ? (
            <p className="p-lead">Cuando Lucca termine una lección, sus preguntas volverán a los 1, 3 y 7 días para que no las olvide.</p>
          ) : (
            <div className="p-chips">
              <span className="p-chip">{plural(review.total, 'pregunta guardada', 'preguntas guardadas')}</span>
              <span className="p-chip p-chip-done">{plural(review.learned, 'aprendida', 'aprendidas')}</span>
              <span className="p-chip">{plural(review.due, 'para hoy', 'para hoy')}</span>
            </div>
          )}
        </section>
      ) : null}
      <section className="p-card" aria-labelledby="help-title">
        <h2 id="help-title">Necesita ayuda</h2>
        {needsHelp.length === 0 ? (
          <p className="p-lead">Lucca no ha pedido ayuda en estas semanas</p>
        ) : (
          <ul className="p-help">
            {needsHelp.map((h) => (
              <li key={`${h.weekStart}-${h.taskId}`}>
                <p className="p-task-title">{h.title}</p>
                <p className="p-hint p-help-meta">
                  <span>Pidió ayuda {plural(h.count, 'vez', 'veces')}</span>
                  <span>Semana: {weekRange('es', h.weekStart)}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {weeks.map((w, index) => {
        const quiet = index === 0 && w.stars === 0 && w.hints === 0 && w.helpRequests === 0;
        const range = weekRange('es', w.weekStart);
        return (
          <section key={w.weekStart} className="p-card" aria-label={range}>
            <h3 className="p-day">
              {range}
              {index === 0 ? <span className="p-chip p-chip-now">Esta semana</span> : null}
            </h3>
            <ProgressBar label={weekProgressText('es', w.done, w.total)} done={w.done} total={w.total} />
            <p>{weekProgressText('es', w.done, w.total)}</p>
            <div className="p-chips">
              <span className="p-chip">{plural(w.stars, 'estrella', 'estrellas')}</span>
              <span className="p-chip">{w.hints === 1 ? '1 pista usada' : `${w.hints} pistas usadas`}</span>
              {w.helpRequests > 0 ? <span className="p-chip p-chip-hidden">Pidió ayuda {plural(w.helpRequests, 'vez', 'veces')}</span> : null}
            </div>
            {quiet ? <p className="p-hint">Todavía no hay actividad de Lucca esta semana</p> : null}
          </section>
        );
      })}
    </div>
  );
}

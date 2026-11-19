import { useCallback, useEffect, useState } from 'react';
import { ApiError, type Overview, type ParentApi } from './api';
import { NETWORK_ERROR } from './fields';

interface Props {
  api: ParentApi;
  onLogout(): void;
}

/** Panel del padre. Carga el resumen una vez y lo comparte con las pestañas. */
export function Dashboard({ api, onLogout }: Props) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    setProblem(null);
    try {
      setOverview(await api.overview());
    } catch (err) {
      // Un 401 ya lo atendió `ParentApp` (vuelve al PIN); aquí solo se explican los demás fallos.
      if (err instanceof ApiError && err.status === 401) return;
      setProblem(err instanceof ApiError ? 'No se pudieron cargar los datos. Inténtalo otra vez.' : NETWORK_ERROR);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (overview) document.documentElement.dataset.theme = overview.settings.theme;
  }, [overview]);

  return (
    <main className="p-shell">
      <header className="p-top">
        <h1>Área de papá</h1>
        <div className="p-top-actions">
          <a className="p-btn p-btn-ghost" href="/">
            Ver la pantalla de Lucca
          </a>
          <button type="button" className="p-btn p-btn-ghost" onClick={onLogout}>
            Salir
          </button>
        </div>
      </header>

      {problem ? (
        <section className="p-card" role="alert">
          <p>{problem}</p>
          <button type="button" className="p-btn p-btn-primary" onClick={() => void load()}>
            Intentar de nuevo
          </button>
        </section>
      ) : null}

      {overview ? (
        <section className="p-card" aria-label="Resumen">
          <h2>Resumen</h2>
          <dl className="p-facts">
            <div>
              <dt>Niño</dt>
              <dd>{overview.settings.childName}</dd>
            </div>
            <div>
              <dt>Grado</dt>
              <dd>{overview.settings.grade}.º</dd>
            </div>
            <div>
              <dt>Tareas guardadas</dt>
              <dd>{overview.tasks.length}</dd>
            </div>
          </dl>
        </section>
      ) : problem ? null : (
        <p className="p-lead">Un momento…</p>
      )}
    </main>
  );
}

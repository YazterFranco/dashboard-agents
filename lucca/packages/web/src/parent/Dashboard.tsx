import { useCallback, useEffect, useState } from 'react';
import type { Task } from '@lucca/shared';
import { ApiError, type Overview, type ParentApi } from './api';
import { LessonPreview } from './LessonPreview';
import { NETWORK_ERROR } from './fields';
import { ProgressTab } from './ProgressTab';
import { SettingsTab } from './SettingsTab';
import { TasksTab } from './TasksTab';

type Tab = 'tasks' | 'progress' | 'settings';
const TABS: { id: Tab; label: string }[] = [
  { id: 'tasks', label: 'Tareas' },
  { id: 'progress', label: 'Progreso' },
  { id: 'settings', label: 'Ajustes' },
];

interface Props {
  api: ParentApi;
  onLogout(): void;
}

/** Panel del padre: el resumen se pide una vez y se comparte con las pestañas; cada cambio lo vuelve a pedir sin vaciar la pantalla. */
export function Dashboard({ api, onLogout }: Props) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('tasks');
  const [preview, setPreview] = useState<Task | null>(null);

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
        <div>
          <h1>Área de papá</h1>
          {overview ? (
            <p className="p-lead">
              <strong>{overview.settings.childName}</strong> · <span>{overview.settings.grade}.º grado</span>
            </p>
          ) : null}
        </div>
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
          <div className="p-actions">
            <button type="button" className="p-btn p-btn-primary" onClick={() => void load()}>
              Intentar de nuevo
            </button>
          </div>
        </section>
      ) : null}

      {overview && preview ? <LessonPreview task={preview} api={api} onClose={() => setPreview(null)} /> : null}
      {overview && !preview ? (
        <>
          <nav className="p-tabs" aria-label="Secciones">
            {TABS.map((t) => (
              <button key={t.id} type="button" className="p-tab-btn" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
          {tab === 'tasks' ? <TasksTab tasks={overview.tasks} today={overview.today} onChanged={() => void load()} api={api} onPreview={setPreview} /> : null}
          {tab === 'progress' ? <ProgressTab api={api} /> : null}
          {tab === 'settings' ? <SettingsTab settings={overview.settings} connections={overview.connections} ai={overview.ai} onSaved={() => void load()} api={api} /> : null}
        </>
      ) : null}
      {!overview && !problem ? <p className="p-lead">Un momento…</p> : null}
    </main>
  );
}

import { navigate } from '../nav';
import { useCallback, useEffect, useMemo, useState } from 'react';
import './parent.css';
import { parentApi, withExpiry, type Connections, type ParentApi } from './api';
import { Dashboard } from './Dashboard';
import { LoginForm } from './LoginForm';
import { Welcome } from '../onboarding/Welcome';

type Phase =
  | { kind: 'loading' }
  | { kind: 'offline' }
  | { kind: 'setup'; connections: Connections }
  | { kind: 'login'; retryAfterSeconds: number; notice?: string; stamp: number }
  | { kind: 'panel' };

const EXPIRED_NOTICE = 'Tu sesión terminó por inactividad. Escribe tu PIN para seguir.';

/** Aplica el tema que la tablet ya guardó, para que el PIN no aparezca en oscuro si la casa usa el claro. */
function applySavedTheme() {
  try {
    const saved = localStorage.getItem('lucca.theme');
    if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
  } catch {
    /* sin almacenamiento: se queda el tema por defecto */
  }
}

export function ParentApp({ api: base = parentApi }: { api?: ParentApi }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const api = useMemo(
    () => withExpiry(base, () => setPhase({ kind: 'login', retryAfterSeconds: 0, notice: EXPIRED_NOTICE, stamp: Date.now() })),
    [base],
  );

  const load = useCallback(async () => {
    setPhase({ kind: 'loading' });
    try {
      const s = await base.status();
      if (!s.setupDone) setPhase({ kind: 'setup', connections: s.connections });
      else if (s.authenticated) setPhase({ kind: 'panel' });
      else setPhase({ kind: 'login', retryAfterSeconds: s.locked ? s.retryAfterSeconds : 0, stamp: Date.now() });
    } catch {
      setPhase({ kind: 'offline' });
    }
  }, [base]);

  useEffect(() => {
    applySavedTheme();
    void load();
  }, [load]);

  async function leave() {
    try {
      await api.logout();
    } catch {
      /* si no se pudo avisar, igual se sale de la pantalla: la sesión caduca sola */
    }
    setPhase({ kind: 'login', retryAfterSeconds: 0, stamp: Date.now() });
  }

  switch (phase.kind) {
    case 'loading':
      return (
        <main className="p-shell p-narrow">
          <p className="p-lead">Un momento…</p>
        </main>
      );
    case 'offline':
      return (
        <main className="p-shell p-narrow">
          <section className="p-card" role="alert">
            <p>No se pudo conectar con el asistente. Revisa que siga encendido.</p>
            <button type="button" className="p-btn p-btn-primary" onClick={() => void load()}>
              Intentar de nuevo
            </button>
          </section>
        </main>
      );
    case 'setup':
      // Primera vez: la guía de uso, que incluye crear el PIN, conectar Mereb y (si se quiere) la IA.
      return (
        <Welcome
          api={api}
          setupDone={false}
          connections={phase.connections}
          onFinish={(dest) => (dest === 'kid' ? navigate('/') : void load())}
        />
      );
    case 'login':
      return <LoginForm key={phase.stamp} api={api} retryAfterSeconds={phase.retryAfterSeconds} notice={phase.notice} onSuccess={() => void load()} />;
    case 'panel':
      return <Dashboard api={api} onLogout={() => void leave()} />;
  }
}

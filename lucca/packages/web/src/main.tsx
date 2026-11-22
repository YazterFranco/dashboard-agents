import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/andika/latin-400.css';
import '@fontsource/andika/latin-700.css';
import '@fontsource/andika/latin-ext-400.css';
import '@fontsource/andika/latin-ext-700.css';
import '@fontsource/bricolage-grotesque/latin-700.css';
import '@fontsource/bricolage-grotesque/latin-800.css';
import './styles.css';
import { App } from './App';
import { ParentApp } from './parent/ParentApp';
import { NAVIGATE_EVENT, interceptInternalLinks, isParentPath } from './nav';

/** `/papa` es el área del padre; todo lo demás es la pantalla de Lucca. Dos pantallas y un cambio sin recargar. */
const root = createRoot(document.getElementById('root')!);

/**
 * Si el asistente aún no está configurado (no hay PIN), cualquier pantalla abre la guía de bienvenida, que vive en
 * el área de papá. Si no se puede preguntar (sin conexión), se muestra la pantalla pedida, que ya sabe avisar.
 */
let renders = 0;
async function render() {
  const mine = ++renders;
  let parent = isParentPath(window.location.pathname);
  if (!parent) {
    try {
      const res = await fetch('/api/parent/status');
      if (res.ok && (await res.json()).setupDone === false) parent = true;
    } catch {
      /* sin servidor: la pantalla de Lucca muestra su propio aviso */
    }
  }
  if (mine !== renders) return; // otro cambio de pantalla llegó mientras se preguntaba
  // `key`: cada cambio de pantalla empieza limpio, como si se hubiera abierto de nuevo.
  root.render(<StrictMode key={`${window.location.pathname}#${mine}`}>{parent ? <ParentApp /> : <App />}</StrictMode>);
}

function startScreens() {
  interceptInternalLinks();
  window.addEventListener('popstate', () => void render());
  window.addEventListener(NAVIGATE_EVENT, () => void render());
  return render();
}

if (import.meta.env.VITE_LUCCA_APP === '1') {
  // App de Android: primero se prepara el servidor interno (base de datos del dispositivo); luego la pantalla.
  import('./app/boot')
    .then(({ bootApp }) => bootApp())
    .then(startScreens)
    .catch((err: unknown) => {
      root.render(<BootError detail={err instanceof Error ? err.message : String(err)} />);
    });
} else {
  void startScreens();
}

/** Si la app no puede abrir sus datos, lo dice con calma y deja reintentar (sin tecnicismos para Lucca). */
function BootError({ detail }: { detail: string }) {
  return (
    <main className="boot-error" role="alert">
      <h1>No pude abrir el asistente</h1>
      <p>Cierra la app y vuelve a abrirla. Si sigue igual, pídele ayuda a papá.</p>
      <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
        Intentar otra vez
      </button>
      <p className="boot-error-detail">{detail}</p>
    </main>
  );
}

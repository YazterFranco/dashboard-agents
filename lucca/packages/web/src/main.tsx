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

/** `/papa` es el área del padre; todo lo demás es la pantalla de Lucca. Sin enrutador: son dos pantallas y nada más. */
const isParentArea = /^\/papa(\/|$)/.test(window.location.pathname);

const root = createRoot(document.getElementById('root')!);
const render = () => root.render(<StrictMode>{isParentArea ? <ParentApp /> : <App />}</StrictMode>);

if (import.meta.env.VITE_LUCCA_APP === '1') {
  // App de Android: primero se prepara el servidor interno (base de datos del dispositivo); luego la pantalla.
  import('./app/boot')
    .then(({ bootApp }) => bootApp())
    .then(render)
    .catch((err: unknown) => {
      root.render(<BootError detail={err instanceof Error ? err.message : String(err)} />);
    });
} else {
  render();
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

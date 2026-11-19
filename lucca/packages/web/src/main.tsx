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

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isParentArea ? <ParentApp /> : <App />}</StrictMode>,
);

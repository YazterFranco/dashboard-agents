import { useState, type FormEvent } from 'react';
import { openExternal } from '../appMode';
import { ApiError, type AppConfigView, type ParentApi } from './api';
import { Field, FormError, GENERIC_ERROR, NETWORK_SAVE_ERROR, keepFocus } from './fields';

const AI_KEYS_URL = 'https://console.anthropic.com/settings/keys';

function errorText(err: unknown, field: 'aiKey' | 'merebUrl'): { field?: string; general?: string } {
  if (!(err instanceof ApiError)) return { general: NETWORK_SAVE_ERROR };
  if (err.status === 401) return {};
  if (err.fields[field]) return { field: err.fields[field] };
  return { general: err.status === 400 ? err.message : GENERIC_ERROR };
}

/** Cómo llega la agenda de Mereb a Lucca. La contraseña de Mereb se escribe solo en la página de Mereb. */
export function MerebSteps() {
  return (
    <ol className="w-steps-list">
      <li>
        Pulsa <strong>Abrir Mereb</strong> y entra con <strong>tu usuario y contraseña de Mereb</strong>, como siempre.
      </li>
      <li>
        En la <strong>Agenda</strong>, elige la semana y pulsa <strong>Exportar actividades</strong>: se descarga un PDF.
      </li>
      <li>
        Abre el PDF con <strong>Lucca</strong> (desde Descargas: <em>Compartir</em> o <em>Abrir con</em>), o vuelve aquí y pulsa{' '}
        <strong>Importar agenda (PDF)</strong>.
      </li>
      <li>Revisa las actividades y pulsa <strong>Añadir</strong>. Lucca las verá el día que toca prepararlas.</li>
    </ol>
  );
}

interface MerebProps {
  api: ParentApi;
  config: AppConfigView;
  onSaved(config: AppConfigView): void;
}

/** Dirección de Mereb del colegio + botón para abrirla. */
export function MerebLink({ api, config, onSaved }: MerebProps) {
  const [url, setUrl] = useState(config.merebUrl ?? '');
  const [error, setError] = useState<string | null>(null);
  const [general, setGeneral] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save(event?: FormEvent): Promise<AppConfigView | null> {
    event?.preventDefault();
    setError(null);
    setGeneral(null);
    setSaved(false);
    if (!url.trim()) {
      setError('Escribe la dirección de Mereb, empezando por https://');
      return null;
    }
    setBusy(true);
    try {
      const next = await api.saveAppConfig({ merebUrl: url.trim() });
      setSaved(true);
      onSaved(next);
      return next;
    } catch (err) {
      const e = errorText(err, 'merebUrl');
      setError(e.field ?? null);
      setGeneral(e.general ?? null);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function open() {
    const target = config.merebUrl === url.trim().replace(/\/+$/, '') ? config.merebUrl : (await save())?.merebUrl;
    if (target) await openExternal(target);
  }

  return (
    <form className="p-form w-form" onSubmit={(e) => void save(e)} noValidate>
      <Field id="mereb-url" label="Dirección de Mereb del colegio" hint="La página donde ves la agenda, por ejemplo https://…" error={error ?? undefined}>
        {(control) => (
          <input
            {...control}
            type="url"
            inputMode="url"
            autoComplete="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setSaved(false);
              if (error) setError(null);
            }}
          />
        )}
      </Field>
      {general ? <FormError>{general}</FormError> : null}
      {saved ? (
        <p className="p-status" role="status">
          Dirección guardada.
        </p>
      ) : null}
      <div className="p-actions">
        <button type="button" className="p-btn p-btn-primary" disabled={busy} onClick={() => void open()} {...keepFocus}>
          Abrir Mereb
        </button>
        <button type="submit" className="p-btn p-btn-ghost" disabled={busy} {...keepFocus}>
          Guardar dirección
        </button>
      </div>
      <p className="p-hint">
        🔒 Lucca no guarda tu contraseña de Mereb: la escribes solo en la página de Mereb, que se abre en el navegador del teléfono.
      </p>
    </form>
  );
}

interface AiProps {
  api: ParentApi;
  config: AppConfigView;
  onSaved(config: AppConfigView): void;
}

/** Clave de IA (opcional) guardada solo en este dispositivo. */
export function AiKeyForm({ api, config, onSaved }: AiProps) {
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [general, setGeneral] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(aiKey: string | null) {
    setError(null);
    setGeneral(null);
    setStatus(null);
    if (aiKey !== null && !aiKey.trim()) {
      setError('Pega la clave completa (empieza por sk-ant-)');
      return;
    }
    setBusy(true);
    try {
      const next = await api.saveAppConfig({ aiKey: aiKey === null ? null : aiKey.trim() });
      setKey('');
      setStatus(next.aiKeySet ? 'Clave guardada. Las próximas lecciones las prepara la IA.' : 'Clave quitada. Las lecciones vuelven a ser ejemplos sencillos.');
      onSaved(next);
    } catch (err) {
      const e = errorText(err, 'aiKey');
      setError(e.field ?? null);
      setGeneral(e.general ?? null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="p-form w-form"
      onSubmit={(e) => {
        e.preventDefault();
        void send(key);
      }}
      noValidate
    >
      <p className="p-status-line">
        {config.aiKeySet ? (
          <>
            <span className="p-chip p-chip-done">Conectada</span> Clave que termina en <strong>…{config.aiKeyHint}</strong>
          </>
        ) : (
          <>
            <span className="p-chip">Sin clave</span> Las lecciones son ejemplos sencillos, sin coste.
          </>
        )}
      </p>
      <Field id="ai-key" label={config.aiKeySet ? 'Cambiar la clave de IA' : 'Clave de IA (Anthropic)'} hint="Empieza por sk-ant-. Se guarda solo en este dispositivo." error={error ?? undefined}>
        {(control) => (
          <input
            {...control}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              if (error) setError(null);
            }}
          />
        )}
      </Field>
      {general ? <FormError>{general}</FormError> : null}
      {status ? (
        <p className="p-status" role="status">
          {status}
        </p>
      ) : null}
      <div className="p-actions">
        <button type="submit" className="p-btn p-btn-primary" disabled={busy} {...keepFocus}>
          Guardar clave
        </button>
        <button type="button" className="p-btn p-btn-ghost" onClick={() => void openExternal(AI_KEYS_URL)}>
          Conseguir una clave
        </button>
        {config.aiKeySet ? (
          <button type="button" className="p-btn p-btn-danger" disabled={busy} onClick={() => void send(null)}>
            Quitar clave
          </button>
        ) : null}
      </div>
      <p className="p-hint">El gasto tiene un tope mensual que eliges en Ajustes (20 dólares por defecto). Al llegar, la IA se pausa sola.</p>
    </form>
  );
}

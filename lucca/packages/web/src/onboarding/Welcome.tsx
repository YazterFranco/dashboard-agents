import { useEffect, useRef, useState } from 'react';
import type { AgendaImportResult } from '@lucca/shared';
import { IS_APP } from '../appMode';
import { AgendaImport, importSummary } from '../parent/AgendaImport';
import { AiKeyForm, MerebLink, MerebSteps } from '../parent/AppConnections';
import { ApiError, type AgendaPreviewResponse, type AppConfigView, type Connections, type ParentApi } from '../parent/api';
import { FormError, GENERIC_ERROR, NETWORK_ERROR } from '../parent/fields';
import { checkPdf } from '../parent/pdfFile';
import { SetupForm } from '../parent/SetupForm';

export type StepId = 'intro' | 'howto' | 'setup' | 'mereb' | 'ai' | 'done';

interface Props {
  api: ParentApi;
  /** Si el PIN ya existe (guía abierta desde el área de papá) no se repite la configuración. */
  setupDone: boolean;
  connections: Connections;
  /** Al terminar: a la pantalla de Lucca o al área de papá. */
  onFinish(dest: 'kid' | 'parent'): void;
  /** Guía abierta desde el área de papá: se puede cerrar en cualquier paso. */
  onClose?(): void;
}

export function stepsFor(setupDone: boolean): StepId[] {
  return setupDone ? ['intro', 'howto', 'mereb', 'ai', 'done'] : ['intro', 'howto', 'setup', 'mereb', 'ai', 'done'];
}

function Progress({ index, total }: { index: number; total: number }) {
  return (
    <div className="w-progress">
      <p className="w-step">
        Paso {index + 1} de {total}
      </p>
      <ol className="w-dots" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <li key={i} className={i < index ? 'w-dot w-dot-done' : i === index ? 'w-dot w-dot-now' : 'w-dot'} />
        ))}
      </ol>
    </div>
  );
}

/**
 * Guía de uso que se abre la primera vez: qué es, cómo lo usan Lucca y papá, el PIN, cómo traer la agenda de
 * Mereb y la clave de IA (opcional). Desde el área de papá se puede volver a abrir.
 */
export function Welcome({ api, setupDone, connections, onFinish, onClose }: Props) {
  const [done, setDone] = useState(setupDone);
  const steps = stepsFor(setupDone);
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const heading = useRef<HTMLHeadingElement>(null);
  const [appConfig, setAppConfig] = useState<AppConfigView | null>(null);
  const [imported, setImported] = useState<AgendaImportResult | null>(null);

  // En cada paso el foco va al título: el lector de pantalla lo anuncia y el teclado empieza arriba.
  useEffect(() => {
    heading.current?.focus();
  }, [index]);

  // La configuración de la app (Mereb, IA) solo existe en la app y con la sesión de papá abierta.
  useEffect(() => {
    if (!IS_APP || !done || appConfig) return;
    api.appConfig().then(setAppConfig, () => {});
  }, [api, done, appConfig]);

  const next = () => setIndex((i) => Math.min(i + 1, steps.length - 1));
  const back = () => setIndex((i) => Math.max(i - 1, 0));
  const progress = <Progress index={index} total={steps.length} />;

  if (step === 'setup') {
    return (
      <SetupForm
        api={api}
        connections={connections}
        stepLabel={progress}
        onDone={() => {
          setDone(true);
          next();
        }}
      />
    );
  }

  const nav = (nextLabel: string) => (
    <div className="w-nav">
      {index > 0 && steps[index - 1] !== 'setup' ? (
        <button type="button" className="p-btn p-btn-ghost" onClick={back}>
          Atrás
        </button>
      ) : null}
      <button type="button" className="p-btn p-btn-primary w-next" onClick={next}>
        {nextLabel}
      </button>
    </div>
  );

  return (
    <main className="p-shell p-narrow w-page">
      <div className="w-top">
        {progress}
        {onClose ? (
          <button type="button" className="p-btn p-btn-ghost p-btn-sm" onClick={onClose}>
            Cerrar la guía
          </button>
        ) : null}
      </div>

      {step === 'intro' ? (
        <>
          <div className="w-hero" aria-hidden="true">
            ⭐
          </div>
          <h1 ref={heading} tabIndex={-1}>
            ¡Bienvenido al asistente de tareas de Lucca!
          </h1>
          <p className="p-lead">Ayuda a Lucca a entender y preparar sus tareas del colegio, sin darle las respuestas.</p>
          <ul className="w-cards">
            <li className="p-card">
              <span className="w-icon" aria-hidden="true">
                📅
              </span>
              <strong>La semana del colegio</strong>
              <span>Las tareas llegan de la agenda de Mereb, cada una el día que toca prepararla.</span>
            </li>
            <li className="p-card">
              <span className="w-icon" aria-hidden="true">
                💡
              </span>
              <strong>Entender y practicar</strong>
              <span>Lecciones cortas con voz, retos que se adaptan y repaso de lo aprendido.</span>
            </li>
            <li className="p-card">
              <span className="w-icon" aria-hidden="true">
                🔒
              </span>
              <strong>El área de papá</strong>
              <span>Con un PIN: agenda, progreso y ajustes. Lucca no puede entrar.</span>
            </li>
          </ul>
          {nav('Empezar')}
        </>
      ) : null}

      {step === 'howto' ? (
        <>
          <h1 ref={heading} tabIndex={-1}>
            Cómo se usa
          </h1>
          <div className="w-two">
            <section className="p-card">
              <h2>
                <span aria-hidden="true">🧒 </span>Lucca
              </h2>
              <ol className="w-steps-list">
                <li>Abre la app y ve las tareas de hoy en «Mi semana».</li>
                <li>
                  Toca <strong>Empezar</strong> para entender el tema con una lección corta (se puede escuchar).
                </li>
                <li>
                  Toca <strong>Practicar</strong> para hacer retos; y cada día, el <strong>Repaso rápido</strong>.
                </li>
                <li>Gana estrellas por esforzarse, no por acertar todo.</li>
              </ol>
            </section>
            <section className="p-card">
              <h2>
                <span aria-hidden="true">👨 </span>Papá
              </h2>
              <ol className="w-steps-list">
                <li>
                  Abajo en la pantalla de Lucca está el candado <strong>Área de papá</strong>.
                </li>
                <li>Entra con tu PIN para traer la agenda, mover o quitar tareas y ver lo que Lucca practicó.</li>
                <li>En Ajustes cambias el nombre, el grado, el idioma, la voz y las pausas.</li>
              </ol>
            </section>
          </div>
          {nav('Siguiente')}
        </>
      ) : null}

      {step === 'mereb' ? (
        <>
          <h1 ref={heading} tabIndex={-1}>
            Conecta la agenda de Mereb
          </h1>
          <p className="p-lead">Lucca usa la agenda semanal que el colegio publica en Mereb. Así se trae:</p>
          <section className="p-card">
            <MerebSteps />
          </section>
          {IS_APP && appConfig ? (
            <section className="p-card">
              <h2>Tu Mereb</h2>
              <MerebLink api={api} config={appConfig} onSaved={setAppConfig} />
            </section>
          ) : null}
          <AgendaNow api={api} imported={imported} onImported={setImported} />
          {nav(imported ? 'Siguiente' : 'Lo hago después')}
        </>
      ) : null}

      {step === 'ai' ? (
        <>
          <h1 ref={heading} tabIndex={-1}>
            Lecciones con IA <span className="w-optional">(opcional)</span>
          </h1>
          <p className="p-lead">
            Con una clave de IA, cada tarea tiene su propia lección (por ejemplo, las palabras de la semana). Sin clave, la app funciona igual con
            lecciones de ejemplo.
          </p>
          {IS_APP ? (
            appConfig ? (
              <section className="p-card">
                <AiKeyForm api={api} config={appConfig} onSaved={setAppConfig} />
              </section>
            ) : null
          ) : (
            <section className="p-card">
              <p>
                En la computadora del asistente, añade <code>ANTHROPIC_API_KEY</code> al archivo <code>.env</code> y reinícialo.
              </p>
            </section>
          )}
          {nav(appConfig?.aiKeySet ? 'Siguiente' : 'Ahora no')}
        </>
      ) : null}

      {step === 'done' ? (
        <>
          <div className="w-hero" aria-hidden="true">
            🎉
          </div>
          <h1 ref={heading} tabIndex={-1}>
            ¡Todo listo!
          </h1>
          <ul className="w-summary">
            <li>
              <span aria-hidden="true">✅</span> PIN de papá creado
            </li>
            <li>
              <span aria-hidden="true">{imported || appConfig?.merebUrl ? '✅' : '➖'}</span>{' '}
              {imported ? importSummary(imported) : appConfig?.merebUrl ? 'Dirección de Mereb guardada' : 'Agenda: impórtala cuando quieras desde Tareas'}
            </li>
            <li>
              <span aria-hidden="true">{appConfig?.aiKeySet || connections.ai ? '✅' : '➖'}</span>{' '}
              {appConfig?.aiKeySet || connections.ai ? 'Lecciones con IA activadas' : 'Lecciones de ejemplo (puedes añadir la clave en Ajustes)'}
            </li>
          </ul>
          <p className="p-hint">Puedes volver a ver esta guía desde el área de papá → «Guía de uso».</p>
          <div className="w-nav">
            <button type="button" className="p-btn p-btn-primary w-next" onClick={() => onFinish('kid')}>
              Ir a la pantalla de Lucca
            </button>
            <button type="button" className="p-btn p-btn-ghost" onClick={() => onFinish('parent')}>
              Ir al área de papá
            </button>
          </div>
        </>
      ) : null}
    </main>
  );
}

/** «Importar la agenda ahora», dentro de la guía (la misma revisión que en Tareas). */
function AgendaNow({ api, imported, onImported }: { api: ParentApi; imported: AgendaImportResult | null; onImported(r: AgendaImportResult): void }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<AgendaPreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function read(file: File | undefined) {
    if (input.current) input.current.value = '';
    if (!file) return;
    const problem = checkPdf(file);
    if (problem) return setError(problem);
    setError(null);
    setBusy(true);
    try {
      setPreview(await api.previewAgenda(file));
    } catch (err) {
      if (!(err instanceof ApiError)) setError(NETWORK_ERROR);
      else if (err.status !== 401) setError(err.status >= 500 ? GENERIC_ERROR : err.message);
    } finally {
      setBusy(false);
    }
  }

  if (preview) {
    return (
      <AgendaImport
        preview={preview}
        api={api}
        onCancel={() => setPreview(null)}
        onDone={(result) => {
          setPreview(null);
          onImported(result);
        }}
      />
    );
  }
  return (
    <section className="p-card">
      <h2>¿Ya tienes el PDF de la agenda?</h2>
      {imported ? (
        <p className="p-status" role="status">
          {importSummary(imported)}
        </p>
      ) : null}
      {error ? <FormError>{error}</FormError> : null}
      <div className="p-actions">
        <button type="button" className="p-btn p-btn-primary" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Leyendo el PDF…' : imported ? 'Importar otro PDF' : 'Importar agenda (PDF)'}
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        className="visually-hidden"
        tabIndex={-1}
        aria-label="Archivo PDF de la agenda"
        onChange={(e) => void read(e.target.files?.[0])}
      />
    </section>
  );
}

import type { ReactNode } from 'react';
import type { Connections } from './api';

export interface ControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: (control: ControlProps) => ReactNode;
}

/** Etiqueta siempre visible, ayuda opcional y el error junto al campo (`role="alert"`, enlazado con `aria-describedby`). */
export function Field({ id, label, hint, error, children }: FieldProps) {
  const described = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ');
  return (
    <div className="p-field">
      <label htmlFor={id}>{label}</label>
      {children({ id, 'aria-describedby': described || undefined, 'aria-invalid': error ? true : undefined })}
      {hint ? (
        <p id={`${id}-hint`} className="p-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="p-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface ChoiceProps<T extends string> {
  legend: string;
  name: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange(value: T): void;
}

/** Elegir una opción entre pocas: radios nativos (teclado y lector de pantalla gratis) con aspecto de botones. */
export function Choice<T extends string>({ legend, name, value, options, onChange }: ChoiceProps<T>) {
  return (
    <fieldset className="p-choice">
      <legend>{legend}</legend>
      <div className="p-choice-row">
        {options.map((o) => (
          <label key={o.value} className="p-choice-opt">
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Mensaje general de un formulario (no pertenece a un campo). */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <p className="p-form-error" role="alert">
      {children}
    </p>
  );
}

export const NETWORK_SAVE_ERROR = 'No se pudo guardar. Revisa que el asistente siga encendido e inténtalo otra vez.';
export const NETWORK_ERROR = 'No se pudo conectar. Revisa que el asistente siga encendido e inténtalo otra vez.';
export const GENERIC_ERROR = 'Algo salió mal. Inténtalo otra vez en un momento.';

/** Plural en español: `plural(2, 'estrella', 'estrellas')` → «2 estrellas». */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function ConnectionRow({ label, ok, children }: { label: string; ok: boolean; children: ReactNode }) {
  return (
    <div className="p-conn">
      <div className="p-conn-head">
        <span className="p-conn-name">{label}</span>
        <span className={ok ? 'p-badge p-badge-ok' : 'p-badge p-badge-warn'}>{ok ? 'Conectada' : 'Falta conectar'}</span>
      </div>
      {ok ? null : <p className="p-hint">{children}</p>}
    </div>
  );
}

/** Estado de la IA y de Mereb. Si falta una, explica cómo añadirla en `.env`; nunca bloquea nada. */
export function ConnectionsPanel({ connections, footer }: { connections: Connections; footer?: ReactNode }) {
  return (
    <section className="p-connections" aria-label="Conexiones">
      <h2>Conexiones</h2>
      <ConnectionRow label="Inteligencia artificial" ok={connections.ai}>
        Añade <code>ANTHROPIC_API_KEY</code> al archivo <code>.env</code> y reinicia el asistente. Hasta entonces las lecciones con IA no estarán disponibles.
      </ConnectionRow>
      <ConnectionRow label="Mereb" ok={connections.mereb}>
        Añade <code>MEREB_URL</code>, <code>MEREB_USER</code> y <code>MEREB_PASSWORD</code> al archivo <code>.env</code>. Mientras tanto puedes añadir las tareas a mano.
      </ConnectionRow>
      {footer}
    </section>
  );
}

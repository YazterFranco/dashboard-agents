import type { ReactNode } from 'react';

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

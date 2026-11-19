import { useEffect, useRef, useState, type FormEvent } from 'react';
import { PinSchema } from '@lucca/shared';
import { ApiError, type ParentApi } from './api';
import { Field, GENERIC_ERROR, NETWORK_ERROR } from './fields';

/** Segundos que faltan como `m:ss`. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

interface Props {
  api: ParentApi;
  /** Segundos de bloqueo que ya trae el estado (0 si no hay). */
  retryAfterSeconds: number;
  /** Aviso amable cuando se vuelve aquí porque la sesión terminó. */
  notice?: string;
  onSuccess(): void;
}

export function LoginForm({ api, retryAfterSeconds, notice, onSuccess }: Props) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const [deadline, setDeadline] = useState<number | null>(retryAfterSeconds > 0 ? Date.now() + retryAfterSeconds * 1000 : null);
  const [now, setNow] = useState(() => Date.now());

  // La cuenta atrás se calcula contra la hora de fin, no restando de a uno: si la tablet duerme, no se desfasa.
  const left = deadline === null ? 0 : Math.max(0, (deadline - now) / 1000);
  const locked = deadline !== null && left > 0;

  useEffect(() => {
    if (deadline === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [deadline]);

  useEffect(() => {
    if (deadline !== null && now >= deadline) {
      setDeadline(null);
      input.current?.focus();
    }
  }, [now, deadline]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current || locked) return;
    if (pin === '') return void setError('Escribe tu PIN');
    const format = PinSchema.safeParse(pin);
    if (!format.success) return void setError(format.error.issues[0].message);
    sending.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await api.login(pin);
      setPin('');
      onSuccess();
    } catch (err) {
      setPin('');
      if (err instanceof ApiError && err.status === 423) {
        setDeadline(Date.now() + (err.retryAfterSeconds ?? 300) * 1000);
        setNow(Date.now());
      } else if (err instanceof ApiError && err.status === 401) {
        const left = err.attemptsLeft;
        setError(left === undefined ? 'PIN incorrecto.' : `PIN incorrecto. ${left === 1 ? 'Te queda 1 intento.' : `Te quedan ${left} intentos.`}`);
      } else if (err instanceof ApiError && err.status === 400 && err.fields.pin) {
        setError(err.fields.pin);
      } else if (err instanceof ApiError) {
        setError(GENERIC_ERROR);
      } else {
        setError(NETWORK_ERROR);
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="p-shell p-narrow">
      <h1>Entra con tu PIN</h1>
      {notice ? (
        <p className="p-notice" role="status">
          {notice}
        </p>
      ) : null}
      <form className="p-card p-form" onSubmit={submit} noValidate>
        <Field id="login-pin" label="PIN" error={error}>
          {(c) => (
            <input
              {...c}
              ref={input}
              type="password"
              inputMode="numeric"
              maxLength={6}
              autoComplete="off"
              value={pin}
              disabled={locked}
              onChange={(e) => {
                setPin(e.target.value);
                setError(undefined);
              }}
            />
          )}
        </Field>
        {locked ? (
          <p className="p-lock">
            Demasiados intentos. Podrás probar de nuevo en{' '}
            <span role="timer" className="p-timer">
              {clock(left)}
            </span>
          </p>
        ) : null}
        <button type="submit" className="p-btn p-btn-primary" disabled={locked || busy} aria-busy={busy || undefined}>
          Entrar
        </button>
      </form>
    </main>
  );
}

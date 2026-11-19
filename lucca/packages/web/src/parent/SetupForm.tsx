import { useRef, useState, type FormEvent } from 'react';
import { PinSchema, SettingsFields, type Lang, type Theme } from '@lucca/shared';
import { ApiError, type Connections, type ParentApi } from './api';
import { Choice, ConnectionsPanel, Field, FormError, GENERIC_ERROR, NETWORK_SAVE_ERROR } from './fields';

type FieldName = 'pin' | 'pin2' | 'childName';
type Errors = Partial<Record<FieldName, string>>;
const ORDER: FieldName[] = ['pin', 'pin2', 'childName'];
const IDS: Record<FieldName, string> = { pin: 'setup-pin', pin2: 'setup-pin2', childName: 'setup-name' };

function checkPin(pin: string): string | undefined {
  const r = PinSchema.safeParse(pin);
  return r.success ? undefined : r.error.issues[0].message;
}
function checkPin2(pin: string, again: string): string | undefined {
  return pin === again ? undefined : 'Los dos PIN deben ser iguales';
}
function checkName(name: string): string | undefined {
  const r = SettingsFields.childName.safeParse(name);
  return r.success ? undefined : r.error.issues[0].message;
}

interface Props {
  api: ParentApi;
  connections: Connections;
  onDone(): void;
}

/** Primera configuración: PIN, nombre, grado, idioma y tema. Las conexiones se explican pero nunca impiden terminar. */
export function SetupForm({ api, connections, onDone }: Props) {
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [name, setName] = useState('');
  const [grade, setGrade] = useState(2);
  const [lang, setLang] = useState<Lang>('es');
  const [theme, setTheme] = useState<Theme>('dark');
  const [errors, setErrors] = useState<Errors>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);

  const setError = (field: FieldName, message: string | undefined) =>
    setErrors((prev) => {
      const next = { ...prev };
      if (message) next[field] = message;
      else delete next[field];
      return next;
    });

  const validators: Record<FieldName, (v: { pin: string; pin2: string; name: string }) => string | undefined> = {
    pin: (v) => checkPin(v.pin),
    pin2: (v) => checkPin2(v.pin, v.pin2),
    childName: (v) => checkName(v.name),
  };
  const values = { pin, pin2, name };
  const blurCheck = (field: FieldName) => setError(field, validators[field](values));

  // Con un error a la vista, se revisa en cada tecla: en cuanto queda bien, el mensaje desaparece.
  const onPin = (value: string) => {
    setPin(value);
    if (errors.pin) setError('pin', checkPin(value));
    if (errors.pin2) setError('pin2', checkPin2(value, pin2));
  };
  const onPin2 = (value: string) => {
    setPin2(value);
    if (errors.pin2) setError('pin2', checkPin2(pin, value));
  };
  const onName = (value: string) => {
    setName(value);
    if (errors.childName) setError('childName', checkName(value));
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current) return;
    const found: Errors = {};
    for (const field of ORDER) {
      const message = validators[field](values);
      if (message) found[field] = message;
    }
    setErrors(found);
    setGeneral(null);
    const first = ORDER.find((f) => found[f]);
    if (first) {
      document.getElementById(IDS[first])?.focus();
      return;
    }
    sending.current = true;
    setBusy(true);
    try {
      await api.setup({ pin, childName: name.trim(), grade, lang, theme });
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && Object.keys(err.fields).length > 0) {
        const mapped: Errors = {};
        const rest: string[] = [];
        for (const [key, message] of Object.entries(err.fields)) {
          if (key === 'pin' || key === 'childName') mapped[key] = message;
          else rest.push(message);
        }
        setErrors(mapped);
        setGeneral(rest[0] ?? null);
        const firstField = ORDER.find((f) => mapped[f]);
        if (firstField) document.getElementById(IDS[firstField])?.focus();
      } else if (err instanceof ApiError && err.status === 409) {
        setGeneral('La configuración ya se hizo. Recarga la página para entrar con tu PIN.');
      } else if (err instanceof ApiError) {
        setGeneral(GENERIC_ERROR);
      } else {
        setGeneral(NETWORK_SAVE_ERROR);
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="p-shell p-narrow">
      <h1>Configura el asistente de Lucca</h1>
      <p className="p-lead">Solo se hace una vez. El PIN protege esta área; Lucca no la ve.</p>
      <form className="p-card p-form" onSubmit={submit} noValidate>
        <Field id={IDS.pin} label="PIN" hint="De 4 a 6 números." error={errors.pin}>
          {(c) => <input {...c} type="password" inputMode="numeric" maxLength={6} autoComplete="off" value={pin} onChange={(e) => onPin(e.target.value)} onBlur={() => blurCheck('pin')} />}
        </Field>
        <Field id={IDS.pin2} label="Repite el PIN" error={errors.pin2}>
          {(c) => <input {...c} type="password" inputMode="numeric" maxLength={6} autoComplete="off" value={pin2} onChange={(e) => onPin2(e.target.value)} onBlur={() => blurCheck('pin2')} />}
        </Field>
        <Field id={IDS.childName} label="Nombre del niño" error={errors.childName}>
          {(c) => <input {...c} type="text" autoComplete="off" value={name} onChange={(e) => onName(e.target.value)} onBlur={() => blurCheck('childName')} />}
        </Field>
        <Field id="setup-grade" label="Grado">
          {(c) => (
            <select {...c} value={grade} onChange={(e) => setGrade(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6].map((g) => (
                <option key={g} value={g}>
                  {g}.º grado
                </option>
              ))}
            </select>
          )}
        </Field>
        <Choice<Lang>
          legend="Idioma de Lucca"
          name="lang"
          value={lang}
          options={[
            { value: 'es', label: 'Español' },
            { value: 'en', label: 'English' },
          ]}
          onChange={setLang}
        />
        <Choice<Theme>
          legend="Tema"
          name="theme"
          value={theme}
          options={[
            { value: 'dark', label: 'Oscuro' },
            { value: 'light', label: 'Claro' },
          ]}
          onChange={setTheme}
        />

        <ConnectionsPanel connections={connections} footer={<p className="p-hint">Puedes terminar la configuración ahora y completar esto después.</p>} />

        {general ? <FormError>{general}</FormError> : null}
        <button type="submit" className="p-btn p-btn-primary" disabled={busy} aria-busy={busy || undefined}>
          Terminar configuración
        </button>
      </form>
    </main>
  );
}

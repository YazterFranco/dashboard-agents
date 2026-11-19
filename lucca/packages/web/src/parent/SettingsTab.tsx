import { useEffect, useRef, useState, type FormEvent } from 'react';
import { PinSchema, SettingsFields, type Lang, type Settings, type Theme, type VoiceMode } from '@lucca/shared';
import { ApiError, type AiSummary, type Connections, type ParentApi } from './api';
import { Choice, ConnectionsPanel, Field, FormError, GENERIC_ERROR, NETWORK_SAVE_ERROR } from './fields';
import { clock } from './LoginForm';

const RATE_MESSAGE = 'La velocidad va de 0,7 a 1,2';
const asText = (rate: number) => String(rate).replace('.', ',');

/** Acepta «1,1» y «1.1». Todo lo demás (letras, vacío) da `null`. */
function parseRate(text: string): number | null {
  const clean = text.trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(clean) ? Number(clean) : null;
}

type Key = 'childName' | 'speechRate' | 'aiMonthlyCapUsd';
const IDS: Record<Key, string> = { childName: 'set-name', speechRate: 'set-rate', aiMonthlyCapUsd: 'set-cap' };
const CAP_MESSAGE = 'El tope va de 1 a 200 dólares';

interface Props {
  settings: Settings;
  connections: Connections;
  ai?: AiSummary;
  onSaved(): void;
  api: ParentApi;
}

const usd = (n: number) => `US$ ${n.toFixed(2).replace('.', ',')}`;
const MODE: Record<AiSummary['mode'], string> = {
  live: 'Con IA (Claude). Las lecciones nuevas se preparan al abrirlas.',
  recorded: 'Lecciones grabadas (modo de prueba, sin coste).',
  off: 'Sin IA: falta ANTHROPIC_API_KEY en el archivo .env. Lucca verá «Esta tarea la vemos con papá».',
};

/** Modo de la IA, gasto del mes frente al tope y lecciones que salieron de respaldo. */
function AiPanel({ ai }: { ai: AiSummary }) {
  const pct = ai.capUsd > 0 ? Math.min(100, Math.round((ai.monthCostUsd / ai.capUsd) * 100)) : 0;
  return (
    <section className="p-card" aria-labelledby="ai-title">
      <h2 id="ai-title">Inteligencia artificial</h2>
      <p>{MODE[ai.mode]}</p>
      <p>
        Gasto de este mes: <strong>{usd(ai.monthCostUsd)}</strong> de {usd(ai.capUsd)}
      </p>
      <div className="bar" role="progressbar" aria-label={`Gasto de IA: ${pct} % del tope`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <span style={{ width: `${pct}%` }} />
      </div>
      {pct >= 100 ? (
        <p className="p-error">Tope de IA alcanzado: Lucca usa solo las lecciones guardadas hasta el mes que viene o hasta que subas el tope.</p>
      ) : pct >= 80 ? (
        <p className="p-lock">Ya va el {pct} % del tope del mes.</p>
      ) : null}
      {ai.alerts.length ? (
        <>
          <h3 className="p-day">Lecciones de respaldo</h3>
          <p className="p-hint">La IA no pudo preparar una buena lección y Lucca ve una sencilla. Puedes regenerarla desde «Ver lección» en Tareas.</p>
          <ul className="p-help">
            {ai.alerts.map((a) => (
              <li key={`${a.taskId}-${a.variant}`}>
                <p className="p-task-title">{a.title}</p>
                {a.issues[0] ? <p className="p-hint">{a.issues[0]}</p> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

export function SettingsTab({ settings, connections, ai, onSaved, api }: Props) {
  return (
    <div className="p-tab">
      <SettingsForm settings={settings} onSaved={onSaved} api={api} />
      <div className="p-card">
        <ConnectionsPanel connections={connections} />
      </div>
      {ai ? <AiPanel ai={ai} /> : null}
      <PinForm api={api} />
    </div>
  );
}

function SettingsForm({ settings, onSaved, api }: Omit<Props, 'connections'>) {
  const [baseline, setBaseline] = useState(settings);
  const [name, setName] = useState(settings.childName);
  const [grade, setGrade] = useState(settings.grade);
  const [lang, setLang] = useState<Lang>(settings.lang);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>(settings.voiceMode);
  const [theme, setTheme] = useState<Theme>(settings.theme);
  const [rate, setRate] = useState(asText(settings.speechRate));
  const [cap, setCap] = useState(String(settings.aiMonthlyCapUsd));
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);

  useEffect(() => setBaseline(settings), [settings]);

  const touch = () => setStatus(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current) return;
    setGeneral(null);
    setStatus(null);

    const found: Partial<Record<Key, string>> = {};
    const nameResult = SettingsFields.childName.safeParse(name);
    if (!nameResult.success) found.childName = nameResult.error.issues[0].message;
    const rateNumber = parseRate(rate);
    const rateResult = rateNumber === null ? null : SettingsFields.speechRate.safeParse(rateNumber);
    if (!rateResult?.success) found.speechRate = RATE_MESSAGE;
    const capNumber = parseRate(cap);
    const capResult = capNumber === null ? null : SettingsFields.aiMonthlyCapUsd.safeParse(capNumber);
    if (!capResult?.success) found.aiMonthlyCapUsd = CAP_MESSAGE;
    setErrors(found);
    const first = (['childName', 'speechRate', 'aiMonthlyCapUsd'] as Key[]).find((k) => found[k]);
    if (first) return void document.getElementById(IDS[first])?.focus();

    const patch: Partial<Omit<Settings, 'tz'>> = {};
    if (nameResult.success && nameResult.data !== baseline.childName) patch.childName = nameResult.data;
    if (grade !== baseline.grade) patch.grade = grade;
    if (lang !== baseline.lang) patch.lang = lang;
    if (voiceMode !== baseline.voiceMode) patch.voiceMode = voiceMode;
    if (theme !== baseline.theme) patch.theme = theme;
    if (rateResult?.success && rateResult.data !== baseline.speechRate) patch.speechRate = rateResult.data;
    if (capResult?.success && capResult.data !== baseline.aiMonthlyCapUsd) patch.aiMonthlyCapUsd = capResult.data;
    if (Object.keys(patch).length === 0) return void setStatus('No hay cambios que guardar');

    sending.current = true;
    setBusy(true);
    try {
      await api.saveSettings(patch);
      setBaseline((b) => ({ ...b, ...patch }));
      setStatus('Ajustes guardados');
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      if (err instanceof ApiError) {
        const mapped: Partial<Record<Key, string>> = {};
        let rest: string | null = null;
        for (const [key, message] of Object.entries(err.fields)) {
          if (key === 'childName' || key === 'speechRate' || key === 'aiMonthlyCapUsd') mapped[key] = message;
          else rest ??= message;
        }
        setErrors(mapped);
        const firstField = (['childName', 'speechRate', 'aiMonthlyCapUsd'] as Key[]).find((k) => mapped[k]);
        if (firstField) document.getElementById(IDS[firstField])?.focus();
        setGeneral(firstField ? rest : (rest ?? GENERIC_ERROR));
      } else {
        setGeneral(NETWORK_SAVE_ERROR);
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <form className="p-card p-form" onSubmit={submit} noValidate>
      <h2>Ajustes</h2>
      <Field id={IDS.childName} label="Nombre del niño" error={errors.childName}>
        {(c) => (
          <input
            {...c}
            type="text"
            autoComplete="off"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              touch();
              if (errors.childName) setErrors(({ childName: _gone, ...rest }) => rest);
            }}
          />
        )}
      </Field>
      <Field id="set-grade" label="Grado">
        {(c) => (
          <select
            {...c}
            value={grade}
            onChange={(e) => {
              setGrade(Number(e.target.value));
              touch();
            }}
          >
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
        name="set-lang"
        value={lang}
        options={[
          { value: 'es', label: 'Español' },
          { value: 'en', label: 'English' },
        ]}
        onChange={(v) => {
          setLang(v);
          touch();
        }}
      />
      <Choice<VoiceMode>
        legend="Cómo aprende Lucca"
        name="set-voice"
        value={voiceMode}
        options={[
          { value: 'both', label: 'Voz y texto' },
          { value: 'text', label: 'Solo texto' },
          { value: 'audio', label: 'Solo voz' },
        ]}
        onChange={(v) => {
          setVoiceMode(v);
          touch();
        }}
      />
      <Choice<Theme>
        legend="Tema"
        name="set-theme"
        value={theme}
        options={[
          { value: 'dark', label: 'Oscuro' },
          { value: 'light', label: 'Claro' },
        ]}
        onChange={(v) => {
          setTheme(v);
          touch();
        }}
      />
      <Field id={IDS.speechRate} label="Velocidad de la voz" hint="De 0,7 (lenta) a 1,2 (rápida). Se usa desde la siguiente carga de la pantalla de Lucca." error={errors.speechRate}>
        {(c) => (
          <input
            {...c}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={rate}
            onChange={(e) => {
              setRate(e.target.value);
              touch();
              if (errors.speechRate) setErrors(({ speechRate: _gone, ...rest }) => rest);
            }}
          />
        )}
      </Field>
      <Field id={IDS.aiMonthlyCapUsd} label="Tope mensual de IA (dólares)" hint="De 1 a 200. Al llegar al tope no se preparan lecciones nuevas; las guardadas siguen funcionando." error={errors.aiMonthlyCapUsd}>
        {(c) => (
          <input
            {...c}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={cap}
            onChange={(e) => {
              setCap(e.target.value);
              touch();
              if (errors.aiMonthlyCapUsd) setErrors(({ aiMonthlyCapUsd: _gone, ...rest }) => rest);
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
        <button type="submit" className="p-btn p-btn-primary" disabled={busy} aria-busy={busy || undefined}>
          Guardar ajustes
        </button>
      </div>
    </form>
  );
}

type PinKey = 'current' | 'next' | 'again';
const PIN_IDS: Record<PinKey, string> = { current: 'pin-current', next: 'pin-new', again: 'pin-new2' };

function PinForm({ api }: { api: ParentApi }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [errors, setErrors] = useState<Partial<Record<PinKey, string>>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);

  const forget = (key: PinKey) => setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current) return;
    setGeneral(null);
    setStatus(null);
    const found: Partial<Record<PinKey, string>> = {};
    if (current === '') found.current = 'Escribe tu PIN actual';
    const nextCheck = PinSchema.safeParse(next);
    if (!nextCheck.success) found.next = nextCheck.error.issues[0].message;
    else if (again !== next) found.again = 'Los dos PIN deben ser iguales';
    setErrors(found);
    const first = (['current', 'next', 'again'] as PinKey[]).find((k) => found[k]);
    if (first) return void document.getElementById(PIN_IDS[first])?.focus();

    sending.current = true;
    setBusy(true);
    try {
      await api.changePin(current, next);
      setCurrent('');
      setNext('');
      setAgain('');
      setStatus('PIN cambiado. Usa el nuevo la próxima vez.');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401 && err.attemptsLeft !== undefined) {
        setCurrent('');
        const left = err.attemptsLeft;
        setErrors({ current: `PIN actual incorrecto. ${left === 1 ? 'Te queda 1 intento.' : `Te quedan ${left} intentos.`}` });
        document.getElementById(PIN_IDS.current)?.focus();
      } else if (err instanceof ApiError && err.status === 401) {
        // Sesión caducada: `ParentApp` ya vuelve al PIN.
      } else if (err instanceof ApiError && err.status === 423) {
        setCurrent('');
        setGeneral(`Demasiados intentos. Prueba otra vez en ${clock(err.retryAfterSeconds ?? 300)}.`);
      } else if (err instanceof ApiError && err.status === 400 && (err.fields.newPin || err.fields.currentPin)) {
        setErrors({ next: err.fields.newPin, current: err.fields.currentPin });
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

  const pinInput = (key: PinKey, label: string, value: string, set: (v: string) => void, hint?: string) => (
    <Field id={PIN_IDS[key]} label={label} hint={hint} error={errors[key]}>
      {(c) => (
        <input
          {...c}
          type="password"
          inputMode="numeric"
          maxLength={6}
          autoComplete="off"
          value={value}
          onChange={(e) => {
            set(e.target.value);
            setStatus(null);
            forget(key);
          }}
        />
      )}
    </Field>
  );

  return (
    <form className="p-card p-form" onSubmit={submit} noValidate>
      <h2>Cambiar PIN</h2>
      {pinInput('current', 'PIN actual', current, setCurrent)}
      {pinInput('next', 'PIN nuevo', next, setNext, 'De 4 a 6 números.')}
      {pinInput('again', 'Repite el PIN nuevo', again, setAgain)}
      {general ? <FormError>{general}</FormError> : null}
      {status ? (
        <p className="p-status" role="status">
          {status}
        </p>
      ) : null}
      <div className="p-actions">
        <button type="submit" className="p-btn p-btn-primary" disabled={busy} aria-busy={busy || undefined}>
          Cambiar PIN
        </button>
      </div>
    </form>
  );
}

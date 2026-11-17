import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SettingsSchema, type KidState, type Settings } from '@lucca/shared';
import { fetchState } from './api';
import { Mascot } from './components/Mascot';
import { WeekScreen } from './components/WeekScreen';
import { t } from './i18n';
import { loadPrefs, savePrefs, type Prefs } from './prefs';
import { createSpeaker } from './speaker';

const FALLBACK: Prefs = { lang: SettingsSchema.parse({}).lang, voiceMode: 'both', theme: 'dark' };

const fromSettings = (s: Settings): Prefs => ({ lang: s.lang, voiceMode: s.voiceMode, theme: s.theme });

export function App() {
  const [state, setState] = useState<KidState | null>(null);
  const [failed, setFailed] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs(FALLBACK));
  const speaker = useMemo(() => createSpeaker(typeof speechSynthesis === 'undefined' ? undefined : speechSynthesis), []);
  const firstLoad = useRef(true);

  const load = useCallback(() => {
    fetchState()
      .then((s) => {
        setState(s);
        setFailed(false);
        // Lo que Lucca eligió en este dispositivo manda; si no eligió nada, valen los ajustes de papá.
        if (firstLoad.current) {
          firstLoad.current = false;
          setPrefs(loadPrefs(fromSettings(s.settings)));
        }
      })
      .catch(() => setFailed(true));
  }, []);

  useEffect(load, [load]);

  // Una tablet que se queda abierta toda la noche debe mostrar el día correcto al volver a mirarla.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'hidden') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme;
    document.documentElement.lang = prefs.lang;
  }, [prefs.theme, prefs.lang]);

  const onPrefs = (next: Prefs) => {
    speaker.stop();
    setPrefs(next);
    savePrefs(next);
  };

  if (state) {
    return <WeekScreen key={state.today} state={state} prefs={prefs} speaker={speaker} onPrefs={onPrefs} onOpenTask={() => undefined} />;
  }

  return (
    <main className="splash">
      <Mascot size={140} />
      <p className="splash-text">{t(prefs.lang, failed ? 'offline' : 'loading')}</p>
      {failed ? (
        <button type="button" className="btn-primary splash-retry" onClick={load}>
          {t(prefs.lang, 'retry')}
        </button>
      ) : null}
    </main>
  );
}

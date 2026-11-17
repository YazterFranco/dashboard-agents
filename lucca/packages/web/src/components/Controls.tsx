import type { Lang, Theme, VoiceMode } from '@lucca/shared';
import { t } from '../i18n';
import type { Prefs } from '../prefs';

interface Option<T extends string> {
  value: T;
  label: string;
  /** Idioma del propio texto del botón (para lectores de pantalla). */
  lang?: string;
}

function Segmented<T extends string>(props: { label: string; value: T; options: Option<T>[]; onChange(value: T): void }) {
  return (
    <div className="control">
      <span className="control-label" aria-hidden="true">
        {props.label}
      </span>
      <div role="group" aria-label={props.label} className="seg">
        {props.options.map((o) => (
          <button
            key={o.value}
            type="button"
            className="seg-btn"
            lang={o.lang}
            aria-pressed={o.value === props.value}
            onClick={() => props.onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Controls({ prefs, onPrefs }: { prefs: Prefs; onPrefs(p: Prefs): void }) {
  const lang: Lang = prefs.lang;
  return (
    <section className="tile controls-tile">
      <Segmented<VoiceMode>
        label={t(lang, 'modeLabel')}
        value={prefs.voiceMode}
        options={[
          { value: 'audio', label: t(lang, 'modeListen') },
          { value: 'text', label: t(lang, 'modeRead') },
          { value: 'both', label: t(lang, 'modeBoth') },
        ]}
        onChange={(voiceMode) => onPrefs({ ...prefs, voiceMode })}
      />
      <Segmented<Lang>
        label={t(lang, 'langLabel')}
        value={prefs.lang}
        options={[
          { value: 'es', label: 'Español', lang: 'es' },
          { value: 'en', label: 'English', lang: 'en' },
        ]}
        onChange={(next) => onPrefs({ ...prefs, lang: next })}
      />
      <Segmented<Theme>
        label={t(lang, 'themeLabel')}
        value={prefs.theme}
        options={[
          { value: 'dark', label: t(lang, 'themeDark') },
          { value: 'light', label: t(lang, 'themeLight') },
        ]}
        onChange={(theme) => onPrefs({ ...prefs, theme })}
      />
    </section>
  );
}

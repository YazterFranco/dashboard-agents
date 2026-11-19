import { LANGS, THEMES, VOICE_MODES, type Lang, type Theme, type VoiceMode } from '@lucca/shared';

export interface Prefs {
  lang: Lang;
  voiceMode: VoiceMode;
  theme: Theme;
}

const KEYS = { lang: 'lucca.lang', voiceMode: 'lucca.mode', theme: 'lucca.theme' } as const;

function defaultStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined; // almacenamiento bloqueado (ventana privada, permisos)
  }
}

function pick<T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(raw as T) ? (raw as T) : fallback;
}

/** Lo que Lucca eligió en este dispositivo; los ajustes del servidor son solo los valores por defecto. */
export function loadPrefs(defaults: Prefs, storage: Pick<Storage, 'getItem'> | undefined = defaultStorage()): Prefs {
  const read = (key: string): string | null => {
    try {
      return storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };
  return {
    lang: pick(read(KEYS.lang), LANGS, defaults.lang),
    voiceMode: pick(read(KEYS.voiceMode), VOICE_MODES, defaults.voiceMode),
    theme: pick(read(KEYS.theme), THEMES, defaults.theme),
  };
}

/** Lo que cambió entre dos juegos de preferencias: solo eso lo eligió Lucca en este dispositivo. */
export function changedPrefs(before: Prefs, after: Prefs): Partial<Prefs> {
  const out: Partial<Prefs> = {};
  if (after.lang !== before.lang) out.lang = after.lang;
  if (after.voiceMode !== before.voiceMode) out.voiceMode = after.voiceMode;
  if (after.theme !== before.theme) out.theme = after.theme;
  return out;
}

/**
 * Guarda solo las preferencias que se le pasan. Si Lucca toca el idioma, el tema no se guarda: así un cambio
 * posterior de papá (tema por defecto) sigue valiendo en esta tablet para lo que Lucca nunca eligió.
 */
export function savePrefs(p: Partial<Prefs>, storage: Pick<Storage, 'setItem'> | undefined = defaultStorage()): void {
  try {
    if (p.lang !== undefined) storage?.setItem(KEYS.lang, p.lang);
    if (p.voiceMode !== undefined) storage?.setItem(KEYS.voiceMode, p.voiceMode);
    if (p.theme !== undefined) storage?.setItem(KEYS.theme, p.theme);
  } catch {
    /* sin almacenamiento: la preferencia vale solo para esta visita */
  }
}

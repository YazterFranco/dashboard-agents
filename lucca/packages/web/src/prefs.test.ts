import { describe, expect, it } from 'vitest';
import { changedPrefs, loadPrefs, savePrefs, type Prefs } from './prefs';

const DEFAULTS: Prefs = { lang: 'es', voiceMode: 'both', theme: 'dark' };

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
}

describe('prefs', () => {
  it('returns the defaults with empty storage', () => {
    expect(loadPrefs(DEFAULTS, memory())).toEqual(DEFAULTS);
  });

  it('reads saved values', () => {
    const s = memory({ 'lucca.lang': 'en', 'lucca.mode': 'text', 'lucca.theme': 'light' });
    expect(loadPrefs(DEFAULTS, s)).toEqual({ lang: 'en', voiceMode: 'text', theme: 'light' });
  });

  it('ignores invalid values', () => {
    const s = memory({ 'lucca.lang': 'fr', 'lucca.mode': 'shout', 'lucca.theme': 'neon' });
    expect(loadPrefs(DEFAULTS, s)).toEqual(DEFAULTS);
  });

  it('does not throw when storage is blocked', () => {
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(loadPrefs(DEFAULTS, blocked)).toEqual(DEFAULTS);
    expect(() => savePrefs({ lang: 'en', voiceMode: 'audio', theme: 'light' }, blocked)).not.toThrow();
  });

  it('saves every preference', () => {
    const s = memory();
    savePrefs({ lang: 'en', voiceMode: 'audio', theme: 'light' }, s);
    expect(s.data).toEqual({ 'lucca.lang': 'en', 'lucca.mode': 'audio', 'lucca.theme': 'light' });
  });
});

describe('only what Lucca changed is remembered on the tablet', () => {
  it('changedPrefs keeps just the keys that differ', () => {
    expect(changedPrefs(DEFAULTS, { ...DEFAULTS, lang: 'en' })).toEqual({ lang: 'en' });
    expect(changedPrefs(DEFAULTS, { lang: 'en', voiceMode: 'text', theme: 'dark' })).toEqual({ lang: 'en', voiceMode: 'text' });
    expect(changedPrefs(DEFAULTS, DEFAULTS)).toEqual({});
  });

  it('saving a partial change writes only that key, so papá\'s defaults still apply to the rest', () => {
    const s = memory();
    savePrefs(changedPrefs(DEFAULTS, { ...DEFAULTS, lang: 'en' }), s);
    expect(s.data).toEqual({ 'lucca.lang': 'en' });
    // Papá cambia el tema por defecto a claro: la tablet lo muestra, porque Lucca nunca eligió tema.
    expect(loadPrefs({ lang: 'es', voiceMode: 'both', theme: 'light' }, s)).toEqual({ lang: 'en', voiceMode: 'both', theme: 'light' });
  });

  it('a key Lucca chose earlier is kept when he changes another one', () => {
    const s = memory({ 'lucca.theme': 'light' });
    savePrefs(changedPrefs({ lang: 'es', voiceMode: 'both', theme: 'light' }, { lang: 'en', voiceMode: 'both', theme: 'light' }), s);
    expect(s.data).toEqual({ 'lucca.theme': 'light', 'lucca.lang': 'en' });
  });
});


import { describe, expect, it } from 'vitest';
import { loadPrefs, savePrefs, type Prefs } from './prefs';

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

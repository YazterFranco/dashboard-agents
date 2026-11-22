// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SettingsSchema } from '@lucca/shared';
import { demoState } from './testFixtures';
import { App } from './App';
import { BACK_EVENT } from './nav';

const okResponse = () => ({ ok: true, json: async () => demoState() });

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('shows a friendly screen when the server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch http://x/api/kid/state')));
    render(<App />);
    await screen.findByText('No encuentro tu agenda ahora. ¡Díselo a papá!');
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/error|fetch|api|http/i);
  });

  it('tries again from the friendly screen', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('boom')).mockResolvedValue(okResponse());
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Intentar de nuevo' }));
    await screen.findByText('¡Hola, Lucca!');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('applies the saved theme and language to the document', async () => {
    localStorage.setItem('lucca.theme', 'light');
    localStorage.setItem('lucca.lang', 'en');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse()));
    render(<App />);
    await screen.findByText('Hi, Lucca!');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.lang).toBe('en');
  });

  it('uses the server defaults when nothing was saved, and saves only what Lucca changes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse()));
    render(<App />);
    await screen.findByText('¡Hola, Lucca!');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('lucca.lang')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    await screen.findByText('Hi, Lucca!');
    expect(localStorage.getItem('lucca.lang')).toBe('en');
  });

  it('asks the server again when the page becomes visible', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    await screen.findByText('¡Hola, Lucca!');
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('selects the new day when the screen refreshes on another day', async () => {
    const wednesday = { ok: true, json: async () => demoState({ today: '2026-11-18' }) };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(okResponse()).mockResolvedValue(wednesday));
    render(<App />);
    const tuesday = await screen.findByRole('button', { name: /Martes 17/ });
    expect(tuesday.getAttribute('aria-pressed')).toBe('true');
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(screen.getByRole('button', { name: /Miércoles 18/ }).getAttribute('aria-pressed')).toBe('true'));
    expect(screen.getByRole('button', { name: /Martes 17/ }).getAttribute('aria-pressed')).toBe('false');
  });

  describe('read-aloud speed', () => {
    class FakeUtterance {
      lang = '';
      rate = 1;
      voice = null;
      onboundary = null;
      onend = null;
      onerror = null;
      constructor(public text: string) {}
    }
    const fakeSynth = () => {
      const spoken: FakeUtterance[] = [];
      return { spoken, speak: (u: FakeUtterance) => void spoken.push(u), cancel: vi.fn(), getVoices: () => [] };
    };

    it('uses the speed the parent chose', async () => {
      const synth = fakeSynth();
      vi.stubGlobal('speechSynthesis', synth);
      vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => demoState({ settings: SettingsSchema.parse({ speechRate: 1.1 }) }) }));
      render(<App />);
      fireEvent.click(await screen.findByRole('button', { name: 'Escuchar a Nova' }));
      expect(synth.spoken[0].rate).toBe(1.1);
    });

    it('keeps 0.9 when the parent did not change it', async () => {
      const synth = fakeSynth();
      vi.stubGlobal('speechSynthesis', synth);
      vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse()));
      render(<App />);
      fireEvent.click(await screen.findByRole('button', { name: 'Escuchar a Nova' }));
      expect(synth.spoken[0].rate).toBe(0.9);
    });

    it('takes the slowest allowed speed', async () => {
      const synth = fakeSynth();
      vi.stubGlobal('speechSynthesis', synth);
      vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => demoState({ settings: SettingsSchema.parse({ speechRate: 0.7 }) }) }));
      render(<App />);
      fireEvent.click(await screen.findByRole('button', { name: 'Escuchar a Nova' }));
      expect(synth.spoken[0].rate).toBe(0.7);
    });
  });
});

describe('App opens a lesson from a task card', () => {
  const lessonDoc = {
    title: { es: [{ text: 'Restas' }], en: [{ text: 'Subtraction' }] },
    screens: [1, 2, 3, 4].map((n) => ({ blocks: [{ type: 'explain', text: { es: [{ text: `Pantalla ${n}.` }], en: [{ text: `Screen ${n}.` }] } }] })),
    quiz: [{ type: 'trueFalse', statement: { es: [{ text: 'Restar es quitar.' }], en: [{ text: 'Subtract.' }] }, answer: true }],
  };
  function routedFetch() {
    return vi.fn(async (url: string) => {
      if (url.startsWith('/api/kid/lessons/')) return { ok: true, json: async () => ({ status: 'ready', lesson: { doc: lessonDoc, variant: 'default', source: 'recorded' } }) };
      return okResponse();
    });
  }

  it('"Empezar" opens the lesson of that task and "Volver a mi semana" comes back to the same day', async () => {
    const fetchMock = routedFetch();
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    await screen.findByText('¡Hola, Lucca!');
    fireEvent.click(screen.getByRole('button', { name: /^Miércoles 18/ }));
    const start = screen.getByRole('button', { name: 'Empezar: Lectura: “My Pet”' });
    start.focus();
    fireEvent.click(start);
    await screen.findByText('Paso 1 de 5');
    expect(fetchMock).toHaveBeenCalledWith('/api/kid/lessons/wed-eng', expect.anything());
    fireEvent.click(screen.getByRole('button', { name: /Volver a mi semana/ }));
    expect(screen.getByRole('button', { name: /^Miércoles 18/ }).getAttribute('aria-pressed')).toBe('true');
    await waitFor(() => expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toBe('Empezar: Lectura: “My Pet”'));
  });

  it('el botón «atrás» de Android cierra la lección y vuelve a Mi semana (sin cerrar la app)', async () => {
    vi.stubGlobal('fetch', routedFetch());
    render(<App />);
    await screen.findByText('¡Hola, Lucca!');
    fireEvent.click(screen.getByRole('button', { name: /^Miércoles 18/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Empezar: Lectura: “My Pet”' }));
    await screen.findByText('Paso 1 de 5');
    const back = new Event(BACK_EVENT, { cancelable: true });
    act(() => {
      window.dispatchEvent(back);
    });
    expect(back.defaultPrevented).toBe(true);
    expect(screen.queryByText('Paso 1 de 5')).toBeNull();
    expect(screen.getByText('¡Hola, Lucca!')).toBeTruthy();
  });

  it('en Mi semana sin nada abierto, «atrás» no lo atiende la pantalla (la app pasa a segundo plano)', async () => {
    vi.stubGlobal('fetch', routedFetch());
    render(<App />);
    await screen.findByText('¡Hola, Lucca!');
    const back = new Event(BACK_EVENT, { cancelable: true });
    act(() => {
      window.dispatchEvent(back);
    });
    expect(back.defaultPrevented).toBe(false);
  });

  it('«atrás» desde el plan de la semana vuelve a Mi semana', async () => {
    vi.stubGlobal('fetch', routedFetch());
    render(<App />);
    await screen.findByText('¡Hola, Lucca!');
    fireEvent.click(screen.getByRole('button', { name: 'Plan de la semana' }));
    await screen.findByRole('heading', { level: 1, name: 'Plan de la semana' });
    const back = new Event(BACK_EVENT, { cancelable: true });
    act(() => {
      window.dispatchEvent(back);
    });
    expect(back.defaultPrevented).toBe(true);
    expect(screen.queryByRole('heading', { level: 1, name: 'Plan de la semana' })).toBeNull();
  });
});

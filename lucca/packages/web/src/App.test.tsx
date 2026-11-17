// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { demoState } from './testFixtures';
import { App } from './App';

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
});

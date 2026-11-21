// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PauseGate } from './pause';

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: false }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

function setup(minutes = 25) {
  render(
    <PauseGate minutes={minutes} lang="es">
      <button type="button">Algo de Lucca</button>
    </PauseGate>,
  );
}

describe('PauseGate', () => {
  it('after the set minutes of use, the mascot proposes a break and the screen behind is not usable', async () => {
    setup(25);
    await tick(24 * 60_000);
    expect(screen.queryByRole('dialog')).toBeNull();
    await tick(60_000 + 15_000);
    expect(screen.getByRole('dialog', { name: '¡Hora de estirarnos!' })).toBeTruthy();
    expect(screen.getByText('Algo de Lucca').closest('[inert]')).toBeTruthy();
  });

  it('the break lasts 5 minutes but can be skipped at any moment, and then the count starts over', async () => {
    setup(10);
    await tick(10 * 60_000 + 15_000);
    expect(screen.getByRole('timer').textContent).toBe('5:00');
    const skip = screen.getByRole('button', { name: 'Seguir ahora' }) as HTMLButtonElement;
    expect(skip.disabled).toBe(false);
    await tick(60_000);
    expect(screen.getByRole('timer').textContent).toBe('4:00');
    fireEvent.click(screen.getByRole('button', { name: 'Seguir ahora' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await tick(9 * 60_000);
    expect(screen.queryByRole('dialog')).toBeNull();
    await tick(60_000 + 15_000);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('when the 5 minutes end, the button says "¡Listo, sigo!"', async () => {
    setup(10);
    await tick(10 * 60_000 + 15_000);
    await tick(5 * 60_000);
    expect(screen.getByRole('timer').textContent).toBe('0:00');
    fireEvent.click(screen.getByRole('button', { name: '¡Listo, sigo!' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('time with the tablet asleep (page hidden) does not count', async () => {
    setup(10);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    await tick(30 * 60_000);
    expect(screen.queryByRole('dialog')).toBeNull();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('0 minutes means no reminder at all', async () => {
    setup(0);
    await tick(5 * 60 * 60_000);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { createRateState } from '../../src/game/codes';
import { createInitialGameState } from '../../src/state/initialState';
import { useGameStore } from '../../src/state/gameStore';

/**
 * UI smoke tests: the app boots, the FTUE battle pauses on the first hit,
 * event playback reaches the victory panel, and defeat opens the
 * «Эхо павших» report. Timers are advanced in chunks — playback is a chain of
 * effect → setTimeout → setState, and one huge advance would starve it.
 */

function resetStore(): void {
  useGameStore.setState({
    game: createInitialGameState(),
    booted: true,
    battle: null,
    screen: 'home',
    modal: null,
    toasts: [],
    defeatTips: [],
    offlineReward: null,
    summonResults: null,
    lastCodeResult: null,
    ftuePause: false,
    codeRate: createRateState(),
  });
}

async function advance(ms: number, step = 400): Promise<void> {
  let left = ms;
  while (left > 0) {
    const chunk = Math.min(step, left);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(chunk);
    });
    left -= chunk;
  }
}

async function bootApp(): Promise<void> {
  render(<App />);
  await advance(2400, 2400);
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  window.localStorage.clear();
  resetStore();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('app smoke', () => {
  it('boots to the home screen with the FTUE hint and the battle CTA', async () => {
    await bootApp();
    expect(await screen.findByText(/Велес, твой первый герой/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /В БОЙ/ })).toBeTruthy();
    expect(screen.getByText('Эхо павших')).toBeTruthy();
  });

  it('FTUE pauses on the first hit, then playback ends with the victory panel', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync });
    await bootApp();
    act(() => {
      // FTUE step 1 + guaranteed victory for determinism
      useGameStore.setState((s) => ({ game: { ...s.game, ftue: { step: 1, done: false } } }));
      useGameStore.getState().submitCode('admin_force_win');
      useGameStore.getState().startBattle('campaign');
    });
    await advance(4000);
    expect(screen.getByText(/Твой герой атакует/)).toBeTruthy();
    expect(useGameStore.getState().ftuePause).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Понятно, дальше!' }));
    // keep pumping the playback chain until it finishes
    for (let i = 0; i < 80 && !(useGameStore.getState().battle?.finished ?? false); i++) {
      await advance(400);
    }
    expect(useGameStore.getState().battle?.finished).toBe(true);
    expect(screen.getByText('Победа!')).toBeTruthy();
    const g = useGameStore.getState().game;
    expect(g.campaign.stage).toBe(2);
    expect(useGameStore.getState().battle?.granted?.gold ?? 0).toBeGreaterThan(0);
  });

  it('defeat opens the «Эхо павших» report with tips and grants souls', async () => {
    await bootApp();
    act(() => {
      useGameStore.getState().submitCode('admin_force_lose');
      useGameStore.getState().startBattle('campaign');
      useGameStore.getState().finishBattle();
    });
    expect(screen.getByText(/Поражение — это не конец/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Реванш/ })).toBeTruthy();
    expect(useGameStore.getState().defeatTips.length).toBeGreaterThan(0);
    expect(useGameStore.getState().game.resources.souls).toBeLessThanOrEqual(20);
  });

  it('renders the summon screen and the odds modal', async () => {
    await bootApp();
    act(() => {
      useGameStore.getState().setScreen('summon');
    });
    expect(screen.getByText('Врата Эха')).toBeTruthy();
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync })
      .click(screen.getByRole('button', { name: /Вероятности/ }));
    expect(screen.getByText('Вероятности призыва')).toBeTruthy();
    expect(screen.getByText(/Гарант/)).toBeTruthy();
  });
});

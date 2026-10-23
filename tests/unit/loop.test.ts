// @vitest-environment jsdom
import { createRoot } from 'react-dom/client';
import { act, createElement } from 'react';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGame } from '@/state/store';
import { FightScreen } from '@/ui/FightScreen';

/**
 * The 3D stage is replaced by a recording double: this test is about the fight
 * loop (fixed timestep, HUD throttling, pause, teardown), not about pixels.
 */
const rendered = { frames: 0, disposed: 0, fighters: 0, resets: 0 };

vi.mock('@/render/stage', () => ({
  FightStage: class {
    constructor() {
      rendered.fighters = 0;
    }
    setFighters(): void {
      rendered.fighters += 1;
    }
    resize(): void {
      return;
    }
    render(): void {
      rendered.frames += 1;
    }
    burst(): void {
      return;
    }
    shakeCamera(): void {
      return;
    }
    reset(): void {
      rendered.resets += 1;
    }
    applyQuality(): void {
      return;
    }
    dispose(): void {
      rendered.disposed += 1;
    }
  },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  rendered.frames = 0;
  rendered.disposed = 0;
  rendered.fighters = 0;
  rendered.resets = 0;
  // jsdom has no WebGL; the loop only needs the probe to succeed because the
  // stage itself is mocked above.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as RenderingContext);
  useGame.setState({ screen: 'fight', fighterId: 'grizlo', opponentId: 'shveya', difficulty: 'normal' });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(FightScreen));
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('fight loop', () => {
  it('renders frames and mounts the stage once', () => {
    expect(rendered.fighters).toBe(1);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(rendered.frames).toBeGreaterThan(5);
  });

  it('counts the round timer down and updates the HUD', () => {
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    const timer = container.querySelector('[data-testid="hud-timer"]');
    expect(timer).not.toBeNull();
    const value = Number(timer?.textContent);
    expect(value).toBeLessThanOrEqual(60);
    expect(value).toBeGreaterThan(54);
  });

  it('pauses the simulation from the HUD button', () => {
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    const pause = container.querySelector('[data-testid="pause-button"]');
    expect(pause).not.toBeNull();
    act(() => {
      pause?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(container.textContent).toContain('ПАУЗА');

    const before = container.querySelector('[data-testid="hud-timer"]')?.textContent;
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(container.querySelector('[data-testid="hud-timer"]')?.textContent).toBe(before);

    const resume = container.querySelector('[data-testid="pause-resume"]');
    act(() => {
      resume?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).not.toContain('ПАУЗА');
  });

  it('disposes the renderer on unmount', async () => {
    // Passive effect clean-up is scheduled, so the unmount has to be awaited.
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    expect(rendered.disposed).toBe(1);
    // Re-mount for the shared afterEach teardown.
    root = createRoot(container);
    act(() => {
      root.render(createElement(FightScreen));
    });
  });
});

// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { useGameStore } from '@/state/gameStore';

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => {
    const gradient = { addColorStop: vi.fn() };
    return {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      createLinearGradient: vi.fn(() => gradient),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      stroke: vi.fn(),
      ellipse: vi.fn(),
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      lineCap: 'round',
    } as unknown as CanvasRenderingContext2D;
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext;

  useGameStore.getState().resetSave();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Full App UI Flow across all 5 Mobile Screens', () => {
  it('mounts cleanly, runs live auto-battle steps, summons x10 heroes, upgrades hero & claims quests', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    act(() => {
      root.render(<App />);
    });

    // 1. Verify Battle Screen & AFK Chest rendered
    expect(host.textContent).toContain('Этап 1-1');
    expect(host.textContent).toContain('Сундук AFK');

    // Advance auto-battle timer so combat steps, VFX, and damage numbers execute
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // Trigger Quick Raid (+2h)
    const raidBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent.includes('Набег +2ч'),
    );
    expect(raidBtn).toBeDefined();
    act(() => {
      raidBtn?.click();
    });
    expect(useGameStore.getState().gold).toBeGreaterThan(10_000);

    // 2. Switch to Summon Screen & trigger 10x Summon
    act(() => {
      useGameStore.getState().setActiveTab('summon');
      vi.advanceTimersByTime(250);
    });
    expect(host.textContent).toContain('Портал Созвездий');

    const tenPullBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent.includes('Призыв x10'),
    );
    expect(tenPullBtn).toBeDefined();
    act(() => {
      tenPullBtn?.click();
      vi.advanceTimersByTime(500);
    });
    expect(host.textContent).toContain('Призвано героев: 10');

    // Dismiss summon modal
    const continueBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent.includes('Продолжить'),
    );
    act(() => {
      continueBtn?.click();
      vi.advanceTimersByTime(250);
    });

    // 3. Switch to Heroes Screen & Level Up + Upgrade All Gear
    act(() => {
      useGameStore.getState().setActiveTab('heroes');
      vi.advanceTimersByTime(250);
    });
    expect(host.textContent).toContain('Игнис');
    const initialIgnisLvl = useGameStore.getState().ownedHeroes.ignis?.level ?? 1;

    const lvlBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent.includes('Ур. +5'),
    );
    act(() => {
      lvlBtn?.click();
    });
    expect(useGameStore.getState().ownedHeroes.ignis?.level).toBeGreaterThan(initialIgnisLvl);

    // 4. Switch to Squad Screen, Auto Lineup & Upgrade Ancient Relic
    act(() => {
      useGameStore.getState().setActiveTab('squad');
      vi.advanceTimersByTime(250);
    });
    expect(host.textContent).toContain('Древние Реликвии Легиона');
    const relicBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent.includes('Усилить'),
    );
    act(() => {
      relicBtn?.click();
    });
    expect(useGameStore.getState().relics.valor).toBe(1);

    // 5. Switch to Tower & Quests Screen, climb Floor 1 & claim Quest
    act(() => {
      useGameStore.getState().setActiveTab('quests');
      vi.advanceTimersByTime(250);
    });
    const climbBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent.includes('Штурмовать 1 этаж!'),
    );
    act(() => {
      climbBtn?.click();
      vi.advanceTimersByTime(600);
    });
    expect(useGameStore.getState().towerFloor).toBe(2);

    // Switch to Quests sub-tab and claim summon quest
    const questsSubBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent.includes('Задания'),
    );
    act(() => {
      questsSubBtn?.click();
      vi.advanceTimersByTime(150);
    });
    const claimBtn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent.trim() === 'Забрать' && !b.disabled,
    );
    expect(claimBtn).toBeDefined();
    act(() => {
      claimBtn?.click();
    });
    expect(useGameStore.getState().claimedQuests.length).toBeGreaterThanOrEqual(1);

    act(() => {
      root.unmount();
    });
    host.remove();
  });
});

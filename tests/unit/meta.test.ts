import { describe, expect, it, vi } from 'vitest';
import { MetaState, META_REWARDS, META_UPGRADES, addBonuses, META_STORAGE_VERSION } from '@/game/meta/MetaState';
import type { RunOutcome } from '@/game/meta/MetaState';
import { NO_BONUSES } from '@/game/player/PlayerStats';

const DEATH: RunOutcome = { kills: 10, floor: 2, chestsOpened: 2, cause: 'combat' };

describe('MetaState economy', () => {
  it('pays kills, floors and chests, and rounds nothing', () => {
    const expected =
      META_REWARDS.perRun +
      10 * META_REWARDS.perKill +
      (2 - 1) * META_REWARDS.perFloor +
      2 * META_REWARDS.perChest;
    expect(MetaState.rewardFor(DEATH)).toBe(expected);
    // A first-floor death is still worth something: losing must not feel wasted.
    expect(MetaState.rewardFor({ ...DEATH, floor: 1, kills: 3, chestsOpened: 0 })).toBeGreaterThan(0);
  });

  it('adds the boss bounty only on victory', () => {
    const win: RunOutcome = { ...DEATH, floor: 3, cause: 'victory' };
    expect(MetaState.rewardFor(win)).toBe(MetaState.rewardFor({ ...win, cause: 'combat' }) + META_REWARDS.perBoss);
  });

  it('grants embers once per run report', () => {
    const meta = new MetaState();
    expect(meta.grantRun(DEATH)).toBe(MetaState.rewardFor(DEATH));
    expect(meta.embers).toBe(MetaState.rewardFor(DEATH));
  });

  it('prices each level above the previous one', () => {
    const meta = new MetaState({ version: 1, embers: 500, levels: {} });
    const upgrade = META_UPGRADES[0];
    expect(upgrade).toBeDefined();
    if (!upgrade) return;
    const first = meta.costOf(upgrade.id);
    expect(first).toBe(upgrade.baseCost);
    expect(meta.purchase(upgrade.id)).toBe(true);
    expect(meta.costOf(upgrade.id)).toBe(upgrade.baseCost + upgrade.costStep);
  });

  it('refuses purchases without embers', () => {
    const meta = new MetaState();
    const id = META_UPGRADES[0]?.id ?? '';
    expect(meta.purchase(id)).toBe(false);
    expect(meta.levelOf(id)).toBe(0);
  });

  it('stops at max level and reports the upgrade as maxed', () => {
    const meta = new MetaState({ version: 1, embers: 100_000, levels: {} });
    const upgrade = META_UPGRADES[0];
    expect(upgrade).toBeDefined();
    if (!upgrade) return;
    for (let i = 0; i < upgrade.maxLevel; i += 1) expect(meta.purchase(upgrade.id)).toBe(true);
    expect(meta.levelOf(upgrade.id)).toBe(upgrade.maxLevel);
    expect(meta.costOf(upgrade.id)).toBeNull();
    expect(meta.purchase(upgrade.id)).toBe(false);
    expect(meta.upgradeViews().find((view) => view.id === upgrade.id)?.maxed).toBe(true);
  });

  it('sums the bonuses of every bought level', () => {
    const meta = new MetaState();
    expect(meta.bonuses()).toEqual(NO_BONUSES);
    meta.addEmbers(10_000);
    meta.purchase('vitality');
    meta.purchase('vitality');
    meta.purchase('might');
    const bonuses = meta.bonuses();
    expect(bonuses.maxHp).toBe(20);
    expect(bonuses.damage).toBe(3);
    expect(bonuses.armor).toBe(0);
  });

  it('counts starting rations from data', () => {
    const meta = new MetaState({ version: 1, embers: 1000, levels: { supplies: 2 } });
    expect(meta.startingRations()).toBe(2);
  });

  it('reports affordability for the UI', () => {
    const meta = new MetaState({ version: 1, embers: 5, levels: {} });
    expect(meta.upgradeViews().every((view) => !view.affordable)).toBe(true);
    meta.addEmbers(200);
    expect(meta.upgradeViews().some((view) => view.affordable)).toBe(true);
  });
});

describe('MetaState persistence', () => {
  it('round-trips through a snapshot', () => {
    const meta = new MetaState({ version: 1, embers: 500, levels: {} });
    meta.purchase('might');
    const restored = new MetaState(meta.snapshot());
    expect(restored.embers).toBe(meta.embers);
    expect(restored.levelOf('might')).toBe(1);
  });

  it('ignores snapshots of another schema version', () => {
    const restored = new MetaState({ version: 2, embers: 999, levels: {} } as unknown as {
      version: 1;
      embers: number;
      levels: Record<string, number>;
    });
    expect(restored.embers).toBe(0);
    expect(restored.snapshot().version).toBe(META_STORAGE_VERSION);
  });

  it('clamps corrupted levels to the upgrade range', () => {
    const restored = new MetaState({ version: 1, embers: -50, levels: { vitality: 99, might: -3, junk: 4 } });
    const vitality = META_UPGRADES.find((upgrade) => upgrade.id === 'vitality');
    expect(restored.embers).toBe(0);
    expect(restored.levelOf('vitality')).toBe(vitality?.maxLevel);
    expect(restored.levelOf('might')).toBe(0);
    expect(restored.levelOf('junk')).toBe(0);
  });
});

describe('addBonuses', () => {
  it('merges gear and meta without mutating either', () => {
    const gear = { ...NO_BONUSES, damage: 5 };
    const meta = { ...NO_BONUSES, damage: 3, maxHp: 20 };
    const total = addBonuses(gear, meta);
    expect(total.damage).toBe(8);
    expect(total.maxHp).toBe(20);
    expect(gear.damage).toBe(5);
    expect(meta.damage).toBe(3);
  });
});

describe('meta storage debounce', () => {
  it('coalesces rapid updates into one write', async () => {
    vi.useFakeTimers();
    const { MetaStorage } = await import('@/game/meta/metaStorage');
    const storage = new MetaStorage();
    const save = vi.spyOn(storage, 'save').mockResolvedValue(undefined);
    storage.update((meta) => meta.addEmbers(3));
    storage.update((meta) => meta.addEmbers(4));
    // `update` returns the live state, so both mutations are already visible.
    expect(storage.value.embers).toBe(7);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(save).toHaveBeenCalledTimes(1);
    expect(storage.value.embers).toBe(7);
    vi.useRealTimers();
  });
});

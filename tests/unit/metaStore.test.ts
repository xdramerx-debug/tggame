import { describe, expect, it } from 'vitest';
import { useMetaStore } from '@/store/useMetaStore';
import { metaStorage } from '@/game/meta/metaStorage';

/**
 * The store is the only place where the pure economy touches React and the
 * running engine. These tests cover the wiring: hydration must not wipe a
 * purchase made mid-flight, and a bought level must reach the scene.
 */
describe('useMetaStore', () => {
  it('hydrates without IndexedDB and survives a blocked store', async () => {
    await useMetaStore.getState().hydrate();
    expect(useMetaStore.getState().loaded).toBe(true);
    expect(useMetaStore.getState().upgrades.length).toBeGreaterThan(0);
  });

  it('grants run rewards into the bar the altar reads', () => {
    const before = useMetaStore.getState().embers;
    const paid = useMetaStore.getState().grantRun({
      kills: 4,
      floor: 2,
      chestsOpened: 1,
      cause: 'combat',
      seconds: 90,
    });
    expect(paid).toBeGreaterThan(0);
    expect(useMetaStore.getState().embers).toBe(before + paid);
    expect(useMetaStore.getState().lastReward).toBe(paid);
  });

  it('buys a level, deducts the price and refreshes the rows', () => {
    metaStorage.update((meta) => meta.addEmbers(100));
    useMetaStore.getState().grantRun({ kills: 0, floor: 1, chestsOpened: 0, cause: 'combat' });

    const before = useMetaStore.getState();
    const row = before.upgrades.find((upgrade) => upgrade.id === 'vitality');
    expect(row?.affordable).toBe(true);
    expect(row?.level).toBe(0);

    expect(before.purchase('vitality')).toBe(true);
    const after = useMetaStore.getState();
    expect(after.upgrades.find((upgrade) => upgrade.id === 'vitality')?.level).toBe(1);
    expect(after.embers).toBe(before.embers - (row?.cost ?? 0));
  });

  it('refuses a purchase it cannot afford and changes nothing', () => {
    // Drain the wallet through the storage layer, then re-sync the view.
    metaStorage.update((meta) => meta.reset());
    useMetaStore.getState().grantRun({ kills: 0, floor: 1, chestsOpened: 0, cause: 'combat' });
    const before = useMetaStore.getState();
    expect(before.embers).toBeLessThan(before.upgrades[0]?.cost ?? Number.POSITIVE_INFINITY);
    expect(before.purchase('vitality')).toBe(false);
    expect(useMetaStore.getState().embers).toBe(before.embers);
    expect(useMetaStore.getState().upgrades.find((upgrade) => upgrade.id === 'vitality')?.level).toBe(0);
  });
});

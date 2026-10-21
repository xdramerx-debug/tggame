import { expect, test } from '@playwright/test';
import { bootIntoRun, holdStick, readState, travelled } from './helpers';
import type { DebugState } from './helpers';

/**
 * Stage-4 acceptance: a procedural BSP floor is generated, rendered and walkable.
 *
 * The seed is pinned through `?seed=` so the assertions are stable; the generator
 * itself is covered deterministically by the unit suite (500 floors).
 */
function layout(state: DebugState): string {
  return `${state.scene.rooms}/${state.scene.doors}@${state.scene.hero.x.toFixed(1)},${state.scene.hero.z.toFixed(1)}`;
}

test.describe('BSP dungeon', () => {
  test('generates a multi-room floor with doors and a bounded light count', async ({ page }) => {
    await bootIntoRun(page, { seed: 4242 });
    const first = await readState(page);
    expect(first.scene.floor).toBe(1);
    expect(first.scene.rooms).toBeGreaterThanOrEqual(5);
    expect(first.scene.rooms).toBeLessThanOrEqual(11);
    expect(first.scene.doors).toBeGreaterThan(0);
    // The scene must stay inside the mobile light budget.
    expect(first.scene.activeLights).toBeGreaterThan(0);
    expect(first.scene.activeLights).toBeLessThanOrEqual(4);
    // Spawn is inside the entrance room, not in a corridor.
    expect(first.scene.roomId).not.toBeNull();
    expect(first.scene.grounded).toBe(true);
  });

  test('is the same dungeon for the same seed', async ({ page }) => {
    await bootIntoRun(page, { seed: 777 });
    const first = await readState(page);
    await bootIntoRun(page, { seed: 777 });
    const second = await readState(page);
    expect(layout(second)).toBe(layout(first));
  });

  test('a different seed yields a different layout', async ({ page }) => {
    await bootIntoRun(page, { seed: 1001 });
    const first = await readState(page);
    await bootIntoRun(page, { seed: 2002 });
    const second = await readState(page);
    expect(layout(second)).not.toBe(layout(first));
  });

  test('the hero can walk through the generated floor without falling', async ({ page }) => {
    await bootIntoRun(page, { seed: 4242 });
    const before = await readState(page);
    await holdStick(page, 40);
    const after = await readState(page);
    expect(travelled(before, after)).toBeGreaterThan(0.5);
    expect(after.scene.grounded).toBe(true);
    expect(after.scene.hero.y).toBeGreaterThan(-0.2);
    expect(after.scene.hero.y).toBeLessThan(0.6);
  });
});

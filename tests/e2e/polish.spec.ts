import { expect, test } from '@playwright/test';
import { bootIntoRun, readState, waitForPhysicsSteps } from './helpers';

/**
 * Stage-11 polish that is observable headlessly: the HUD shows the run level and
 * an XP bar, and a level-up is a real state change (not just a toast).
 *
 * Feel features (hit-stop, particles, screen shake) are unit-tested where they
 * are pure; in the browser only their contract is checked — the simulation
 * always advances, even through a freeze.
 */
test.describe('run progression and impact feedback', () => {
  test('HUD exposes level and XP progress from the first floor', async ({ page }) => {
    await bootIntoRun(page, { seed: 777 });
    const state = await readState(page);
    expect(state.scene.level).toBe(1);
    expect(state.scene.xpToNext).toBeGreaterThan(0);

    await expect(page.getByTestId('level-label')).toHaveAttribute('data-level', '1');
    const fill = page.getByTestId('xp-fill');
    await expect(fill).toHaveAttribute('data-xp', '0');
    await expect(fill).toHaveAttribute('data-xp-to-next', String(state.scene.xpToNext));
  });

  test('banked experience raises the level and the XP bar', async ({ page }) => {
    // The grant is applied by a retrying dev hook, so poll for the level.
    await bootIntoRun(page, { seed: 778, query: 'xp=120' });
    await expect
      .poll(async () => (await readState(page)).scene.level, { timeout: 20_000, intervals: [200, 400] })
      .toBeGreaterThan(1);

    const state = await readState(page);
    await expect(page.getByTestId('level-label')).toHaveAttribute('data-level', String(state.scene.level));
    // Level 2 is a stat bump: the maximum HP moves with it.
    expect(state.scene.maxHp).toBeGreaterThan(100);
  });

  test('the simulation keeps advancing through impact freezes', async ({ page }) => {
    await bootIntoRun(page, { seed: 779 });
    await waitForPhysicsSteps(page, 30);
    const state = await readState(page);
    // Outside a hit-stop the scale is exactly 1 (the freeze is never permanent).
    expect(state.timeScale).toBeGreaterThan(0.1);
    expect(state.timeScale).toBeLessThanOrEqual(1);
  });
});

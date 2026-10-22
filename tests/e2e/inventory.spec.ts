import { expect, test } from '@playwright/test';
import { bootIntoRun, readState } from './helpers';

/**
 * Stage-7 acceptance: the bag exists, opens from the HUD and pauses the run.
 *
 * Loot generation itself is covered by the unit suite (deterministic rolls), so
 * the browser test only checks the touch path: button → sheet → close.
 */
test.describe('inventory', () => {
  test('opens from the HUD, shows gold and three equipment slots, and closes', async ({ page }) => {
    await bootIntoRun(page, { seed: 4242 });

    await page.getByTestId('inventory-button').tap();
    await expect(page.getByTestId('inventory-gold')).toBeVisible();
    await expect(page.getByTestId('equip-slot-weapon')).toBeVisible();
    await expect(page.getByTestId('equip-slot-armor')).toBeVisible();
    await expect(page.getByTestId('equip-slot-charm')).toBeVisible();
    await expect(page.getByTestId('inventory-empty')).toBeVisible();

    await page.getByRole('button', { name: 'Закрыть' }).first().tap();
    await expect(page.getByTestId('inventory-gold')).toBeHidden();
  });

  test('the run has chests and reports gold in the HUD', async ({ page }) => {
    await bootIntoRun(page, { seed: 4242 });
    const state = await readState(page);
    // Treasure rooms come from `rooms.json`; a floor always has at least one.
    expect(state.scene.chests ?? 0).toBeGreaterThan(0);
    expect(state.scene.gold).toBe(0);
    await expect(page.getByTestId('gold-label')).toHaveText(/◈ 0/);
  });
});

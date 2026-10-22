import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { bootIntoRun, readState } from './helpers';

/**
 * Stage-7 acceptance: the HUD exposes gold and a bag, and the bag opens a panel
 * with three equipment slots.
 *
 * The button is activated with a dispatched pointer/click pair instead of
 * `tap()`: on CI the joystick and camera surfaces sit under the HUD, and a
 * synthetic gesture keeps this test about the panel rather than about hit
 * testing (touch hit-testing itself is covered by `touch.spec.ts`).
 */
async function pressTestId(page: Page, testId: string): Promise<void> {
  await page.evaluate((id) => {
    const element = document.querySelector(`[data-testid="${id}"]`);
    if (!(element instanceof HTMLElement)) throw new Error(`missing ${id}`);
    element.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 9 }),
    );
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }, testId);
}

test.describe('inventory', () => {
  test('opens from the HUD, shows gold and three equipment slots, and closes', async ({ page }) => {
    await bootIntoRun(page, { seed: 4242 });

    await expect(page.getByTestId('inventory-button')).toHaveCount(1);
    await pressTestId(page, 'inventory-button');

    // Diagnostics: if the sheet fails to open, report what the HUD actually shows.
    const opened = await page.getByTestId('inventory-gold').isVisible();
    const hudText = opened ? '' : (await page.locator('body').innerText()).slice(0, 300);
    expect(opened, `inventory panel did not open; screen text: ${hudText}`).toBe(true);
    await expect(page.getByTestId('equip-slot-weapon')).toBeVisible();
    await expect(page.getByTestId('equip-slot-armor')).toBeVisible();
    await expect(page.getByTestId('equip-slot-charm')).toBeVisible();
    await expect(page.getByTestId('inventory-empty')).toBeVisible();
    await expect(page.getByTestId('inventory-totals')).toHaveText('Без бонусов');

    await pressTestId(page, 'sheet-close');
    await expect(page.getByTestId('inventory-gold')).toBeHidden();
  });

  test('the floor carries chests and the HUD starts at zero gold', async ({ page }) => {
    await bootIntoRun(page, { seed: 4242 });
    const state = await readState(page);
    expect(state.scene.chests ?? 0).toBeGreaterThan(0);
    expect(state.scene.gold).toBe(0);
    expect(state.scene.items).toBe(0);
    await expect(page.getByTestId('gold-label')).toContainText('◈ 0');
  });
});

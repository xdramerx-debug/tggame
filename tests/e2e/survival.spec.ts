import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { bootIntoRun, readState } from './helpers';

/** Dispatches a pointer/click pair on a test id (see `inventory.spec.ts`). */
async function pressTestId(page: Page, testId: string): Promise<void> {
  await page.evaluate((id) => {
    const element = document.querySelector(`[data-testid="${id}"]`);
    if (!(element instanceof HTMLElement)) throw new Error(`missing ${id}`);
    element.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 7 }),
    );
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }, testId);
}

/**
 * Stage-8 acceptance: hunger is a live clock, food is consumable from the HUD,
 * and dying opens a summary screen with a working restart.
 */
test.describe('survival', () => {
  test('the hunger clock runs and food is reachable from the HUD', async ({ page }) => {
    await bootIntoRun(page, { seed: 4242 });
    const start = await readState(page);
    expect(start.scene.satiety).toBeGreaterThan(0);
    expect(start.scene.hunger).toBe('fed');
    expect(start.scene.rations).toBeGreaterThanOrEqual(1);
    expect(start.scene.dead).toBe(false);

    await expect(page.getByTestId('ration-button')).toBeVisible();
    await pressTestId(page, 'ration-button');
    // Eating one ration spends exactly one item.
    await expect(page.getByTestId('ration-button')).toHaveAttribute(
      'data-rations',
      String((start.scene.rations ?? 1) - 1),
    );
  });

  test('death shows the run summary and restart starts a fresh run', async ({ page }) => {
    await bootIntoRun(page, { seed: 4242, query: 'kill=1' });

    await expect(page.getByTestId('death-screen')).toBeVisible();
    await expect(page.getByTestId('death-summary')).toBeVisible();
    const dead = await readState(page);
    expect(dead.scene.dead).toBe(true);
    expect(dead.scene.hp).toBe(0);

    await pressTestId(page, 'death-restart');
    await expect(page.getByTestId('death-screen')).toBeHidden();

    const fresh = await readState(page);
    expect(fresh.scene.dead).toBe(false);
    expect(fresh.scene.hp).toBe(100);
    expect(fresh.scene.kills).toBe(0);
    expect(fresh.scene.floor).toBe(1);
  });
});

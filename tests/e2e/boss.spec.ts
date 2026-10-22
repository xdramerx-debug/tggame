import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { bootIntoRun, readState } from './helpers';

/** Dispatches a pointer/click pair on a test id (see `inventory.spec.ts`). */
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

/**
 * Stage-9 acceptance: the third floor holds a real boss with a readable health
 * bar, and embers earned by a run can be spent in the altar.
 */
test.describe('boss and meta progression', () => {
  test('the boss bar appears in the arena', async ({ page }) => {
    await bootIntoRun(page, { seed: 31, query: 'floor=3&boss=1' });

    const state = await readState(page);
    expect(state.scene.floor).toBe(3);
    expect(state.scene.dead).toBe(false);

    await expect(page.getByTestId('boss-bar')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('boss-bar')).toHaveAttribute('data-phase', '0');
  });

  test('dying pays embers and the altar screen opens from the summary', async ({ page }) => {
    await bootIntoRun(page, { seed: 4242, query: 'kill=1' });
    await expect(page.getByTestId('death-screen')).toBeVisible();

    const reward = page.getByTestId('death-reward');
    await expect(reward).toBeVisible();
    const paid = Number(await reward.getAttribute('data-embers'));
    expect(paid).toBeGreaterThan(0);

    await pressTestId(page, 'death-altar');
    await expect(page.getByTestId('meta-screen')).toBeVisible({ timeout: 10_000 });
    // The payout is already credited: the altar must show at least what was won.
    const embers = Number(await page.getByTestId('meta-embers').innerText().then((text) => text.replace(/\D/g, '')));
    expect(embers).toBeGreaterThanOrEqual(paid);
    await expect(page.getByTestId('upgrade-vitality')).toBeVisible();
  });

  test('embers can buy a level and the purchase is persisted', async ({ page }) => {
    await bootIntoRun(page, { seed: 4242, query: 'kill=1&embers=60' });
    await expect(page.getByTestId('death-screen')).toBeVisible();
    await pressTestId(page, 'death-altar');
    await expect(page.getByTestId('meta-screen')).toBeVisible();

    // `?embers=60` is the dev pay-out hook: the first vitality level costs 12.
    await expect(page.getByTestId('upgrade-buy-vitality')).toBeEnabled();
    await pressTestId(page, 'upgrade-buy-vitality');
    await expect(page.getByTestId('upgrade-level-vitality')).toHaveText('1/5');

    await page.reload();
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('menu-Алтарь').click();
    await expect(page.getByTestId('upgrade-level-vitality')).toHaveText('1/5');
  });
});

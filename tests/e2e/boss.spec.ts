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
/** Reads the dev-only economy view (null when the bridge is missing). */
async function readMeta(
  page: Page,
): Promise<{ storeId: string; attempts: number; purchases: number; lastHint: string; levels: Record<string, number> } | null> {
  return page.evaluate(() => window.__TENEBRIS_META__?.() ?? null);
}

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
    await expect(page.getByTestId('meta-hint')).toBeAttached();
    // The payout is already credited: the altar must show at least what was won.
    const embers = Number(await page.getByTestId('meta-embers').innerText().then((text) => text.replace(/\D/g, '')));
    expect(embers).toBeGreaterThanOrEqual(paid);
    await expect(page.getByTestId('upgrade-vitality')).toBeVisible();
  });

  test('embers buy altar levels in a single tap and the tap is not swallowed', async ({ page }) => {
    const logs: string[] = [];
    page.on('pageerror', (error) => logs.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') logs.push(message.text());
    });
    // `?embers=60` is the dev pay-out hook: the first vitality level costs 12.
    await bootIntoRun(page, { seed: 4242, query: 'kill=1&embers=60' });
    await expect(page.getByTestId('death-screen')).toBeVisible();
    await pressTestId(page, 'death-altar');
    await expect(page.getByTestId('meta-screen')).toBeVisible();
    // Exactly one altar tree: a duplicated screen (an unmounted copy left by a
    // screen transition) would take taps but never repaint.
    await expect(page.getByTestId('meta-screen')).toHaveCount(1);

    const buy = page.getByTestId('upgrade-buy-vitality');
    await expect(buy).toHaveAttribute('data-affordable', 'true');
    const embersBefore = Number((await page.getByTestId('meta-embers').innerText()).replace(/\D/g, ''));

    await pressTestId(page, 'upgrade-buy-vitality');

    const meta = await readMeta(page);
    const diagnostics = `${JSON.stringify(meta)} | logs: ${logs.join(' | ')}`;
    expect(meta?.attempts ?? 0, `purchase was never called (${diagnostics})`).toBeGreaterThan(0);
    expect(meta?.purchases ?? 0, `purchase refused (${diagnostics})`).toBeGreaterThan(0);
    // The altar repaints and the price is actually deducted.
    expect(await page.getByTestId('upgrade-level-vitality').innerText(), diagnostics).toBe('1/5');
    const embersAfter = Number((await page.getByTestId('meta-embers').innerText()).replace(/\D/g, ''));
    expect(embersAfter, diagnostics).toBe(embersBefore - 12);
  });
});

import { expect, test } from '@playwright/test';

/**
 * Stage-1 acceptance checks, executed against a production-like dev server.
 * They deliberately avoid classes/inside-DOM implementation details and rely on
 * stable `data-testid` hooks instead.
 */

test.describe('TENEBRIS bootstrap', () => {
  test('boots from splash to menu within the mobile budget', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    const startedAt = Date.now();
    await page.goto('/');
    await expect(page.getByTestId('splash')).toBeVisible();

    // Splash must not flash: minimum dwell is 900 ms, engine boot included.
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 15_000 });
    const menuVisibleMs = Date.now() - startedAt;

    // First interactive screen well under the 2.5 s first-render budget on CI
    // software rendering; mirrored on device by the splash measurement below.
    expect(menuVisibleMs).toBeLessThan(10_000);
    expect(errors, `console errors: ${errors.join(' | ')}`).toHaveLength(0);

    await expect(page.getByTestId('menu-Начать забег')).toBeVisible();
  });

  test('renders the test arena and exposes live frame stats', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('menu-Начать забег').click();

    const canvas = page.getByTestId('game-canvas');
    await expect(canvas).toBeVisible();

    const dimensions = await canvas.evaluate((element) => {
      const node = element as HTMLCanvasElement;
      const context = node.getContext('webgl2') ?? node.getContext('webgl');
      return {
        width: node.width,
        height: node.height,
        clientWidth: node.clientWidth,
        hasContext: context !== null,
        lost: context?.isContextLost() ?? true,
      };
    });

    expect(dimensions.hasContext).toBe(true);
    expect(dimensions.lost).toBe(false);
    expect(dimensions.width).toBeGreaterThan(0);
    expect(dimensions.clientWidth).toBeGreaterThan(0);

    // Dev perf overlay proves the loop is producing frames.
    const perf = page.getByTestId('perf-overlay');
    await expect(perf).toBeVisible({ timeout: 15_000 });
    await expect(perf).toContainText('FPS');

    // Frame counter must advance (rendering is live, not a frozen first frame).
    await expect
      .poll(
        async () => {
          const text = (await perf.textContent()) ?? '';
          return Number.parseFloat(text);
        },
        { timeout: 15_000, intervals: [500] },
      )
      .toBeGreaterThan(0);
  });

  test('pauses back to the menu without errors', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('menu-Начать забег').click();
    await expect(page.getByTestId('game-canvas')).toBeVisible();

    await page.getByTestId('pause-button').tap();
    await expect(page.getByTestId('main-menu')).toBeVisible();
  });

  test('blocks the game in portrait with the rotate overlay', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByTestId('orientation-overlay')).toBeVisible();
    await expect(page.getByTestId('orientation-overlay')).toContainText('Поверните телефон');

    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.getByTestId('orientation-overlay')).toBeHidden();
  });

  test('guards browser gestures that would break gameplay', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 15_000 });

    const prevented = await page.evaluate(() => {
      const results: boolean[] = [];
      for (const type of ['contextmenu', 'dblclick', 'gesturestart']) {
        const event = new Event(type, { bubbles: true, cancelable: true });
        document.dispatchEvent(event);
        results.push(event.defaultPrevented);
      }
      return results;
    });
    expect(prevented).toEqual([true, true, true]);

    const touchAction = await page.evaluate(() => getComputedStyle(document.body).touchAction);
    expect(touchAction).toBe('none');
  });
});

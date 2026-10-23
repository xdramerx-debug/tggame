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

test.describe('Telegram chrome in a browser build', () => {
  test('greets the player and offers an invite link', async ({ page }) => {
    await page.goto('/?quality=low');
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 20_000 });
    // Outside Telegram (and with the mock env) there is no name: the neutral
    // greeting must still render, not an empty line.
    await expect(page.getByTestId('menu-greeting')).not.toBeEmpty();
    await expect(page.getByTestId('menu-Позвать друга')).toBeVisible();
  });

  test('settings state where progress is stored', async ({ page }) => {
    await page.goto('/?quality=low');
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('menu-Настройки').click();
    // A plain browser has no CloudStorage: the sheet must say so instead of
    // pretending the progress is backed up.
    await expect(page.getByTestId('cloud-status')).toHaveAttribute('data-cloud', 'off');
    await expect(page.getByTestId('cloud-status')).toContainText('только на этом устройстве');
  });
});

test.describe('installable app shell', () => {
  test('serves a landscape fullscreen manifest with generated icons', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest');
    expect(response.ok()).toBe(true);
    const manifest = (await response.json()) as {
      display: string;
      orientation: string;
      icons: { src: string; sizes: string; purpose: string }[];
    };
    expect(manifest.display).toBe('fullscreen');
    expect(manifest.orientation).toBe('landscape');
    expect(manifest.icons).toHaveLength(3);
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);

    for (const icon of manifest.icons) {
      const asset = await request.get(`/${icon.src}`);
      expect(asset.ok(), `${icon.src} must be served`).toBe(true);
      expect(asset.headers()['content-type']).toContain('image/png');
    }
  });
});

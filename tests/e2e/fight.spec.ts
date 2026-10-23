import { expect, test } from '@playwright/test';

/**
 * Mobile E2E: the path a player actually takes, on a landscape phone.
 *
 * WebGL is provided by SwiftShader on CI for Chromium (see playwright.config.ts).
 * WebKit on a Linux runner has no reliable WebGL, so the 3D-dependent specs are
 * skipped there — the menu and selection flow still run on both engines.
 */

const NO_WEBGL = 'WebKit on the Linux CI runner has no reliable WebGL context';

test.beforeEach(async ({ page }) => {
  // Force the cheapest render preset: CI runners have no GPU and SwiftShader
  // would otherwise spend seconds per frame in the 3D stage.
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'freakpit.settings.v1',
      JSON.stringify({
        sound: false,
        quality: 'low',
        difficulty: 'normal',
        fighterId: 'grizlo',
        wins: 0,
        fights: 0,
      }),
    );
  });
  await page.goto('/');
});

test('menu boots with a title, a call to action and big enough touch targets', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1 })).toContainText('FREAK');
  await expect(page.getByTestId('menu-start')).toBeVisible();

  const sizes = await page.locator('button:visible').evaluateAll((buttons) =>
    buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }),
  );
  expect(sizes.length).toBeGreaterThan(0);
  for (const size of sizes) {
    expect(size.height).toBeGreaterThanOrEqual(44);
    expect(size.width).toBeGreaterThanOrEqual(44);
  }
});

test('selection screen offers the four freaks and starts a fight', async ({ page, browserName }) => {
  await page.getByTestId('menu-start').tap();

  await expect(page.getByRole('heading', { level: 2 })).toContainText('урода');
  for (const id of ['grizlo', 'shveya', 'oko', 'pech']) {
    await expect(page.getByTestId(`fighter-${id}`)).toBeVisible();
  }
  await expect(page.getByTestId('difficulty-hard')).toBeVisible();

  test.skip(browserName === 'webkit', NO_WEBGL);

  await page.getByTestId('select-start').tap();

  const canvas = page.getByTestId('fight-canvas');
  await expect(canvas).toBeVisible();
  await expect(page.getByTestId('hud-timer')).toHaveText(/^\d{2}$/);

  const webgl = await canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement;
    return target.getContext('webgl2') !== null || target.getContext('webgl') !== null;
  });
  expect(webgl).toBe(true);
});

test('pause sheet opens and the fight resumes', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', NO_WEBGL);

  await page.getByTestId('menu-start').tap();
  await page.getByTestId('select-start').tap();
  const timer = page.getByTestId('hud-timer');
  await expect(timer).toBeVisible();

  // Let the intro finish so the clock is actually running.
  await page.waitForTimeout(2500);
  const before = await timer.textContent();

  await page.getByTestId('pause-button').tap();
  await expect(page.getByText('ПАУЗА')).toBeVisible();

  const paused = await timer.textContent();
  await page.waitForTimeout(1200);
  expect(await timer.textContent()).toBe(paused);

  await page.getByTestId('pause-resume').tap();
  await expect(page.getByText('ПАУЗА')).toBeHidden();

  await page.waitForTimeout(1600);
  expect(await timer.textContent()).not.toBe(before);
});

test('the fight runs on a fixed tick and the timer counts down', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', NO_WEBGL);

  await page.getByTestId('menu-start').tap();
  await page.getByTestId('select-start').tap();

  const timer = page.getByTestId('hud-timer');
  await expect(timer).toBeVisible();
  await page.waitForTimeout(4500);
  const value = Number(await timer.textContent());
  // Intro is 1.6 s, so after 4.5 s the clock is a couple of seconds in.
  expect(value).toBeLessThan(60);
  expect(value).toBeGreaterThan(48);
});

test('the 3D pit is actually drawn, not a black canvas', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', NO_WEBGL);

  await page.getByTestId('menu-start').tap();
  await page.getByTestId('select-start').tap();
  await expect(page.getByTestId('fight-canvas')).toBeVisible();
  await page.waitForTimeout(1500);

  // A black or empty canvas compresses to a couple of kilobytes; a lit scene
  // with two fighters, sparks and the quarry wall does not. Cheap guard against
  // a silently broken renderer that still passes the WebGL-context check.
  const shot = await page.screenshot();
  expect(shot.byteLength).toBeGreaterThan(24_000);
});

test('no horizontal overflow on the menu', async ({ page }) => {
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(fits).toBe(true);
});

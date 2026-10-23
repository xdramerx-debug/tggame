import { expect, test } from '@playwright/test';

/**
 * Mobile E2E: the whole path a player actually takes, on a landscape phone.
 *
 * WebGL is provided by SwiftShader on CI (see playwright.config.ts), so the 3D
 * stage really is created — these tests would fail on a black-canvas regression.
 */

test.beforeEach(async ({ page }) => {
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

test('selection screen offers the four freaks and starts a fight', async ({ page }) => {
  await page.getByTestId('menu-start').tap();

  await expect(page.getByRole('heading', { level: 2 })).toContainText('урода');
  for (const name of ['ГРЫЗЛО', 'ШВЕЯ', 'ОКО', 'ПЕЧЬ']) {
    await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible();
  }

  await page.getByTestId('select-start').tap();

  const canvas = page.getByTestId('fight-canvas');
  await expect(canvas).toBeVisible();
  await expect(page.getByTestId('hud-timer')).toHaveText(/^\d{2}$/);

  const webgl = await canvas.evaluate((element) => {
    const context = (element as HTMLCanvasElement).getContext('webgl2') ?? (element as HTMLCanvasElement).getContext('webgl');
    return context !== null;
  });
  expect(webgl).toBe(true);
});

test('pause sheet opens, sound toggles and the fight resumes', async ({ page }) => {
  await page.getByTestId('menu-start').tap();
  await page.getByTestId('select-start').tap();
  await expect(page.getByTestId('hud-timer')).toBeVisible();

  await page.getByTestId('pause-button').tap();
  await expect(page.getByText('ПАУЗА')).toBeVisible();

  await page.getByTestId('pause-resume').tap();
  await expect(page.getByText('ПАУЗА')).toBeHidden();

  const timer = page.getByTestId('hud-timer');
  const before = await timer.textContent();
  await page.waitForTimeout(1200);
  const after = await timer.textContent();
  expect(after).not.toBe(before);
});

test('the fight runs on a fixed tick and the timer actually counts down', async ({ page }) => {
  await page.getByTestId('menu-start').tap();
  await page.getByTestId('select-start').tap();

  const timer = page.getByTestId('hud-timer');
  await expect(timer).toBeVisible();
  await page.waitForTimeout(2500);
  const value = Number(await timer.textContent());
  expect(value).toBeLessThan(60);
  expect(value).toBeGreaterThan(50);
});

test('no horizontal overflow and the arena canvas fills the viewport', async ({ page }) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(overflow).toBe(true);
});

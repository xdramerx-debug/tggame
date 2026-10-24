import { expect, test } from '@playwright/test';

/**
 * Дымовой e2e для «Хамсина»: меню → бой → HUD и управление.
 * WebGL в CI через SwiftShader; движок обязан либо запуститься, либо
 * показать явный fallback — белый экран недопустим.
 */

test('меню загружается и показывает экран игры', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => { errors.push(e.message); });

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'ХАМСИН' })).toBeVisible({ timeout: 30_000 });
  const play = page.getByRole('button', { name: 'Начать игру' });
  await expect(play).toBeVisible();

  await play.tap();

  const fire = page.getByRole('button', { name: 'Огонь' });
  const hp = page.locator('.bar-fill.hp');
  const fallback = page.getByText('WebGL недоступен');
  await expect(fire.or(fallback)).toBeVisible({ timeout: 30_000 });
  if (await fire.isVisible()) {
    await expect(hp).toBeVisible();
    await expect(page.getByText('ВОЛНА 1').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.minimap')).toBeVisible();
    await expect(page.locator('.weapon-bar')).toBeVisible();
  }

  expect(errors, `page errors: ${errors.join('; ')}`).toEqual([]);
});

test('удержание огня тратит патроны, пауза останавливает бой', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Начать игру' }).tap();

  const fire = page.getByRole('button', { name: 'Огонь' });
  const fallback = page.getByText('WebGL недоступен');
  await expect(fire.or(fallback)).toBeVisible({ timeout: 30_000 });
  test.skip(!(await fire.isVisible()), 'WebGL недоступен в этом раннере');

  const ammo = page.locator('.ammo-num');
  await expect(ammo).toHaveText('12');

  const box = await fire.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(1100);
    await page.mouse.up();
  }
  await expect(ammo).not.toHaveText('12', { timeout: 10_000 });

  await page.getByRole('button', { name: 'Пауза' }).tap();
  await expect(page.getByRole('heading', { name: 'ПАУЗА' })).toBeVisible();
  await page.getByRole('button', { name: 'Продолжить' }).tap();
  await expect(page.getByRole('button', { name: 'Огонь' })).toBeVisible();
});

test('радио открывает магазин между волнами', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Начать игру' }).tap();

  const fire = page.getByRole('button', { name: 'Огонь' });
  const fallback = page.getByText('WebGL недоступен');
  await expect(fire.or(fallback)).toBeVisible({ timeout: 30_000 });
  test.skip(!(await fire.isVisible()), 'WebGL недоступен');

  const radio = page.getByRole('button', { name: 'Радио' });
  await expect(radio).toBeVisible();
  await radio.tap();
  await expect(page.getByText('РАДИО · ЗАКУПКА')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Закрыть магазин' })).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть магазин' }).tap();
  await expect(page.getByRole('button', { name: 'Огонь' })).toBeVisible();
});

import { expect, test } from '@playwright/test';

/**
 * Дымовой e2e: меню → бой → HUD и контролы видны.
 * WebGL в CI рендерится через SwiftShader; движок обязан либо запуститься,
 * либо показать явное сообщение — белый экран недопустим.
 */

test('меню загружается и показывает экран игры', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => { errors.push(e.message); });

  await page.goto('/');

  // splash заменяется приложением
  await expect(page.getByRole('heading', { name: 'МЁРТВАЯ ЗОНА' })).toBeVisible({ timeout: 30_000 });
  const play = page.getByRole('button', { name: 'Начать игру' });
  await expect(play).toBeVisible();

  await play.tap();

  // HUD: здоровье и кнопка огня (или честный WebGL-фолбэк)
  const fire = page.getByRole('button', { name: 'Огонь' });
  const hp = page.locator('.hp-fill');
  const fallback = page.getByText('WebGL недоступен');
  await expect(fire.or(fallback)).toBeVisible({ timeout: 30_000 });
  if (await fire.isVisible()) {
    await expect(hp).toBeVisible();
    await expect(page.getByText('ВОЛНА 1').first()).toBeVisible({ timeout: 15_000 });
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
  await expect(ammo).toHaveText('30');

  // удерживаем огонь ~1 c → очередь
  const box = await fire.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(1200);
    await page.mouse.up();
  }
  await expect(ammo).not.toHaveText('30', { timeout: 10_000 });

  // пауза
  await page.getByRole('button', { name: 'Пауза' }).tap();
  await expect(page.getByRole('heading', { name: 'ПАУЗА' })).toBeVisible();
  await page.getByRole('button', { name: 'Продолжить' }).tap();
  await expect(page.getByRole('button', { name: 'Огонь' })).toBeVisible();
});

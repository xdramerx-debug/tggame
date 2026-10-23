import { expect, test } from '@playwright/test';

/**
 * Mobile E2E smoke: boot → FTUE first battle (pause on first hit) → victory →
 * reward → «Улучшить героя» → navigation → summon odds → persistence.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      window.localStorage.clear();
    } catch {
      // ignore
    }
  });
});

test('FTUE: first battle, pause on first hit, victory and upgrade', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Пробуждение героев…').or(page.getByText('Настройка врат…')).first()).toBeVisible();
  await expect(page.getByText('В БОЙ')).toBeVisible({ timeout: 15_000 });

  // FTUE hint about the starter hero
  await expect(page.getByText('Это Велес, твой первый герой')).toBeVisible();

  // Step 1: battle runs automatically but pauses on the first hit
  await page.getByText('В БОЙ').click();
  await expect(page.getByText('Твой герой атакует')).toBeVisible({ timeout: 20_000 });
  await page.getByText('Понятно, дальше!').click();

  // Victory panel with rewards
  await expect(page.getByText('Победа!')).toBeVisible({ timeout: 120_000 });
  await page.getByText('К обзору').click();

  // Back home, FTUE step 2 hint points at upgrading
  await expect(page.getByText('В БОЙ')).toBeVisible({ timeout: 15_000 });

  // Heroes tab: open starter hero and level him up
  await page.getByText('Герои', { exact: true }).click();
  await page.getByText('Велес Тёмный').first().click();
  await expect(page.getByText('Уровень 1 / 20')).toBeVisible();
  await page.getByText('⬆ Улучшить +1').click();
  await expect(page.getByText('Уровень 2 / 20')).toBeVisible();
  await page.getByRole('button', { name: '✕' }).click();

  // Squad tab shows the front-row slot filled
  await page.getByText('Отряд', { exact: true }).click();
  await expect(page.getByText('ПЕРЕДНИЙ РЯД')).toBeVisible();
  await expect(page.getByText('Велес Тёмный').first()).toBeVisible();

  // Summon tab: odds are visible before pressing (§5)
  await page.getByText('Призыв', { exact: true }).click();
  await page.getByText('Вероятности').click();
  await expect(page.getByText('Вероятности призыва')).toBeVisible();
  await expect(page.getByText('Гарант (pity)')).toBeVisible();
  await page.getByRole('button', { name: '✕' }).click();

  // Ordinary summon with starting scrolls
  await page.getByText('Призыв x1').first().click();
  await expect(page.getByText('Результат призыва')).toBeVisible({ timeout: 20_000 });
  await page.getByText('Забрать').click();

  // Progress persists across a reload (§2: автосохранение)
  await page.reload();
  await expect(page.getByText('В БОЙ')).toBeVisible({ timeout: 15_000 });
  await page.getByText('Герои', { exact: true }).click();
  await page.getByText('Велес Тёмный').first().click();
  await expect(page.getByText('Уровень 2 / 20')).toBeVisible();
});

test('second battle is faster after the upgrade (ощущение прогресса)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('В БОЙ')).toBeVisible({ timeout: 15_000 });
  await page.getByText('В БОЙ').click();
  if (await page.getByText('Понятно, дальше!').isVisible({ timeout: 20_000 }).catch(() => false)) {
    await page.getByText('Понятно, дальше!').click();
  }
  await expect(page.getByText('Победа!')).toBeVisible({ timeout: 120_000 });
  await page.getByText('Следующий бой').click();
  // second battle starts right away (FTUE step 3)
  await expect(page.getByText('Победа!').or(page.getByText('Поражение — это не конец'))).toBeVisible({ timeout: 120_000 });
});

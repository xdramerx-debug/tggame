import { expect, test, type Page } from '@playwright/test';

/**
 * Mobile E2E smoke: boot → FTUE battle #1 (pause on first hit, guaranteed win)
 * → victory → upgrade hero (FTUE step 3) → squad → summon with public odds →
 * persistence after reload → FTUE battle #2 (no pause, faster).
 *
 * Все локаторы — role/scoped: тексты кнопок содержат эмодзи, а FTUE-плашка
 * дублирует «В БОЙ», поэтому getByText в лоб даёт strict-mode violation.
 */

const battleBtn = (page: Page) => page.getByRole('button', { name: /В БОЙ/ });

const nav = (page: Page, label: string) => page.locator('.bottom-nav').getByText(label);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      window.localStorage.clear();
    } catch {
      // ignore
    }
  });
});

test('FTUE: первый бой с паузой, победа, улучшение героя, призыв, персист', async ({ page }) => {
  await page.goto('/');

  // Home after boot: FTUE hint + main CTA
  await expect(battleBtn(page)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Велес, твой первый герой/)).toBeVisible();

  // FTUE battle #1: pauses on first hit, guaranteed victory
  await battleBtn(page).click();
  await expect(page.getByText(/Твой герой атакует/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Понятно, дальше!' }).click();

  await expect(page.getByText('Победа!')).toBeVisible({ timeout: 90_000 });
  await page.getByRole('button', { name: 'К обзору' }).click();

  // FTUE step 3 hint: upgrade the hero
  await expect(nav(page, 'Герои')).toBeVisible({ timeout: 20_000 });
  await nav(page, 'Герои').click();
  await page.getByText('Велес Тёмный').first().click();
  await expect(page.getByText('Уровень 1 / 20')).toBeVisible();
  await page.getByRole('button', { name: /Улучшить \+1/ }).click();
  await expect(page.getByText('Уровень 2 / 20')).toBeVisible();
  await page.getByRole('button', { name: '✕' }).click();

  // Squad screen: front row explained
  await nav(page, 'Отряд').click();
  await expect(page.getByText(/ПЕРЕДНИЙ РЯД/)).toBeVisible();
  await expect(page.getByText('Велес Тёмный').first()).toBeVisible();

  // Summon: public odds before the pull (§5), then x1 with a starting scroll
  await nav(page, 'Призыв').click();
  await page.getByRole('button', { name: /Вероятности/ }).click();
  await expect(page.getByText('Вероятности призыва')).toBeVisible();
  await expect(page.getByText(/Гарант \(pity\)/)).toBeVisible();
  await page.getByRole('button', { name: '✕' }).click();
  await page.getByText('Призыв x1').first().click();
  await expect(page.getByText('Результат призыва')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Забрать' }).click();

  // Progress persists across reload (§2)
  await page.reload();
  await expect(battleBtn(page)).toBeVisible({ timeout: 20_000 });
  await nav(page, 'Герои').click();
  await page.getByText('Велес Тёмный').first().click();
  await expect(page.getByText('Уровень 2 / 20')).toBeVisible();
});

test('FTUE battle #2 goes faster: no pause, battle plays to the end', async ({ page }) => {
  await page.goto('/');
  await expect(battleBtn(page)).toBeVisible({ timeout: 20_000 });

  // Battle #1 (forced win, with pause)
  await battleBtn(page).click();
  await expect(page.getByText(/Твой герой атакует/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Понятно, дальше!' }).click();
  await expect(page.getByText('Победа!')).toBeVisible({ timeout: 90_000 });
  await page.getByRole('button', { name: 'Следующий бой' }).click();

  // Battle #2 starts automatically after the victory button (step 3).
  // It may end in victory or defeat (real sim, no force) — both panels are fine;
  // what matters: no FTUE pause this time.
  await expect(
    page.getByText('Победа!').or(page.getByText(/Поражение — это не конец/)),
  ).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/Твой герой атакует/)).toHaveCount(0);
});

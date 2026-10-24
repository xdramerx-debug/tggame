import { expect, test, type Page } from '@playwright/test';

/**
 * Mobile E2E smoke of the full FTUE (§9): boot → battle #1 (pause on first hit,
 * guaranteed win) → upgrade hero → battle #2 (faster, no pause) → summon with
 * public odds → persistence after reload.
 *
 * Locators are role/scoped or exact: several strings legitimately appear twice
 * (the «В БОЙ» button vs the FTUE hint; the «Победа!» panel title vs the reward
 * toast), so a bare getByText would trip Playwright's strict-mode.
 */

const battleBtn = (page: Page) => page.getByRole('button', { name: /В БОЙ/ });
const nav = (page: Page, label: string) => page.locator('.bottom-nav').getByText(label);
// Panel title «Победа!» — exact so it doesn't match the reward toast «Победа! +… 🪙»
const victoryPanel = (page: Page) => page.getByText('Победа!', { exact: true });

async function bootToHome(page: Page): Promise<void> {
  await page.goto('/');
  await expect(battleBtn(page)).toBeVisible({ timeout: 20_000 });
}

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
  await bootToHome(page);
  await expect(page.getByText(/Велес, твой первый герой/)).toBeVisible();

  // FTUE battle #1: pauses on first hit, guaranteed victory
  await battleBtn(page).click();
  await expect(page.getByText(/Твой герой атакует/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Понятно, дальше!' }).click();

  await expect(victoryPanel(page)).toBeVisible({ timeout: 90_000 });
  await page.getByRole('button', { name: 'К обзору' }).click();

  // FTUE step: upgrade the hero
  await expect(nav(page, 'Герои')).toBeVisible({ timeout: 20_000 });
  await nav(page, 'Герои').click();
  await page.getByText('Велес Тёмный').first().click();
  await expect(page.getByText('Уровень 1 / 20')).toBeVisible();
  await page.getByRole('button', { name: /Улучшить \+1/ }).click();
  await expect(page.getByText('Уровень 2 / 20')).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть' }).click();

  // Squad screen: front row explained
  await nav(page, 'Отряд').click();
  await expect(page.getByText(/ПЕРЕДНИЙ РЯД/)).toBeVisible();
  await expect(page.getByText('Велес Тёмный').first()).toBeVisible();

  // Summon: public odds before the pull (§5), then x1 with a starting scroll
  await nav(page, 'Призыв').click();
  await page.getByRole('button', { name: /Вероятности/ }).click();
  await expect(page.getByText('Вероятности призыва')).toBeVisible();
  await expect(page.getByText(/Гарант \(pity\)/)).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть' }).click();
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

test('FTUE battle #2 goes faster: no pause on the second fight', async ({ page }) => {
  await bootToHome(page);

  // Battle #1 (forced win, with pause) → «К обзору» advances FTUE to the upgrade step
  await battleBtn(page).click();
  await expect(page.getByText(/Твой герой атакует/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Понятно, дальше!' }).click();
  await expect(victoryPanel(page)).toBeVisible({ timeout: 90_000 });
  await page.getByRole('button', { name: 'К обзору' }).click();

  // Upgrade the hero → FTUE step advances so battle #2 is the scripted faster one
  await nav(page, 'Герои').click();
  await page.getByText('Велес Тёмный').first().click();
  await page.getByRole('button', { name: /Улучшить \+1/ }).click();
  await expect(page.getByText('Уровень 2 / 20')).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть' }).click();

  // Battle #2: starts on the home CTA, plays through WITHOUT the first-hit pause
  await nav(page, 'Бой').click();
  await battleBtn(page).click();
  await expect(victoryPanel(page)).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/Твой герой атакует/)).toHaveCount(0);
});

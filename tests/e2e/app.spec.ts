import { expect, test } from '@playwright/test';

test('Astral Legion mobile RPG end-to-end flow', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');

  // Verify Campaign screen & AFK chest loaded cleanly
  await expect(page.getByText(/Этап 1-/)).toBeVisible();
  await expect(page.getByText(/Сундук AFK/)).toBeVisible();

  // Trigger free 2h Quick Raid
  await page.getByRole('button', { name: /Набег \+2ч/ }).click();

  // Navigate to Summon Portal and perform a 10x pull
  await page.getByRole('button', { name: 'Призыв', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Портал Созвездий' })).toBeVisible();
  await page.getByRole('button', { name: /Призыв x10/ }).click();
  await expect(page.getByRole('heading', { name: 'Призвано героев: 10' })).toBeVisible();
  await page.getByRole('button', { name: 'Продолжить' }).click();

  // Navigate to Heroes screen and level up Ignis
  await page.getByRole('button', { name: 'Герои', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Игнис/ })).toBeVisible();
  await page.getByRole('button', { name: /Уровень \+1/ }).click();

  // Navigate to Squad screen and trigger Auto Best Lineup
  await page.getByRole('button', { name: 'Отряд', exact: true }).click();
  await page.getByRole('button', { name: /Авто-строй/ }).click();

  // Navigate to Tower & Quests screen and verify quests list
  await page.getByRole('button', { name: 'Башня', exact: true }).click();
  await page.getByRole('button', { name: /Задания/ }).click();
  await expect(page.getByText('Совершить 5 призывов героев')).toBeVisible();

  expect(errors).toEqual([]);
});

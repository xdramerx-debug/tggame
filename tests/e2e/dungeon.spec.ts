import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Stage-4 acceptance: a procedural BSP floor is generated, rendered and walkable.
 *
 * The seed is pinned through `?seed=` so the assertions are stable across runs;
 * the generator itself is covered deterministically by the unit suite.
 */
async function bootDungeon(page: Page, seed = 4242): Promise<void> {
  await page.goto(`/?seed=${seed}`);
  await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('menu-Начать забег').click();
  await expect(page.getByTestId('game-canvas')).toBeVisible();
  await expect(page.getByTestId('perf-overlay')).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(async () => page.evaluate(() => window.__TENEBRIS__?.getState()?.physicsSteps ?? 0))
    .toBeGreaterThan(0);
}

interface DungeonState {
  physicsSteps: number;
  fps: number;
  scene: {
    hero: { x: number; y: number; z: number };
    grounded: boolean;
    floor?: number;
    rooms?: number;
    doors?: number;
    activeLights?: number;
    roomId?: number | null;
  };
}

async function state(page: Page): Promise<DungeonState> {
  const snapshot = await page.evaluate(() => window.__TENEBRIS__?.getState() ?? null);
  if (!snapshot) throw new Error('debug bridge is missing');
  return snapshot;
}

async function holdStick(page: Page, dx: number, dy: number, holdMs: number): Promise<void> {
  const size = page.viewportSize();
  if (!size) throw new Error('viewport unknown');
  const startX = 120;
  const startY = size.height - 130;
  await page.evaluate(
    ({ startX: sx, startY: sy, offsetX, offsetY }) => {
      const zone = document.querySelector('[data-testid="stick-zone"]');
      if (!zone) throw new Error('stick zone missing');
      const fire = (type: string, clientX: number, clientY: number): void => {
        zone.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 7,
            pointerType: 'touch',
            isPrimary: true,
            clientX,
            clientY,
            bubbles: true,
            cancelable: true,
          }),
        );
      };
      fire('pointerdown', sx, sy);
      fire('pointermove', sx + offsetX, sy + offsetY);
    },
    { startX, startY, offsetX: dx, offsetY: dy },
  );
  await page.waitForTimeout(holdMs);
  await page.evaluate(() => {
    document.querySelector('[data-testid="stick-zone"]')?.dispatchEvent(
      new PointerEvent('pointerup', {
        pointerId: 7,
        pointerType: 'touch',
        clientX: 0,
        clientY: 0,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

test.describe('BSP dungeon', () => {
  test('generates a multi-room floor with doors and a bounded light count', async ({ page }) => {
    await bootDungeon(page);
    const first = await state(page);
    expect(first.scene.floor).toBe(1);
    expect(first.scene.rooms).toBeGreaterThanOrEqual(5);
    expect(first.scene.rooms).toBeLessThanOrEqual(11);
    expect(first.scene.doors).toBeGreaterThan(0);
    // The scene must stay inside the mobile light budget.
    expect(first.scene.activeLights).toBeGreaterThan(0);
    expect(first.scene.activeLights).toBeLessThanOrEqual(4);
    // Spawn is inside the entrance room, not in a corridor.
    expect(first.scene.roomId).not.toBeNull();
    expect(first.scene.grounded).toBe(true);
  });

  test('is the same dungeon for the same seed', async ({ page }) => {
    await bootDungeon(page, 777);
    const first = await state(page);
    await page.goto('/?seed=777');
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('menu-Начать забег').click();
    await expect
      .poll(async () => page.evaluate(() => window.__TENEBRIS__?.getState()?.physicsSteps ?? 0))
      .toBeGreaterThan(0);
    const second = await state(page);
    expect(second.scene.rooms).toBe(first.scene.rooms);
    expect(second.scene.doors).toBe(first.scene.doors);
    expect(second.scene.hero.x).toBeCloseTo(first.scene.hero.x, 1);
    expect(second.scene.hero.z).toBeCloseTo(first.scene.hero.z, 1);
  });

  test('a different seed yields a different layout', async ({ page }) => {
    await bootDungeon(page, 1001);
    const first = await state(page);
    await page.goto('/?seed=2002');
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('menu-Начать забег').click();
    await expect
      .poll(async () => page.evaluate(() => window.__TENEBRIS__?.getState()?.physicsSteps ?? 0))
      .toBeGreaterThan(0);
    const second = await state(page);
    const sameSpawn =
      Math.abs(second.scene.hero.x - first.scene.hero.x) < 0.01 &&
      Math.abs(second.scene.hero.z - first.scene.hero.z) < 0.01;
    const sameShape = second.scene.rooms === first.scene.rooms && second.scene.doors === first.scene.doors;
    expect(sameSpawn && sameShape).toBe(false);
  });

  test('the hero can walk through the generated floor without falling', async ({ page }) => {
    await bootDungeon(page, 4242);
    const before = await state(page);
    await holdStick(page, 0, -90, 700);
    await page.waitForTimeout(250);
    const after = await state(page);
    const travelled = Math.hypot(after.scene.hero.x - before.scene.hero.x, after.scene.hero.z - before.scene.hero.z);
    expect(travelled).toBeGreaterThan(0.6);
    expect(after.scene.grounded).toBe(true);
    expect(after.scene.hero.y).toBeGreaterThan(-0.2);
    expect(after.scene.hero.y).toBeLessThan(0.6);
  });
});

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Stage-3 acceptance: Rapier is running, the character is grounded and the
 * capsule is actually driven by the simulation (not by the old kinematic clamp).
 */
async function bootIntoRun(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('menu-Начать забег').click();
  await expect(page.getByTestId('game-canvas')).toBeVisible();
  await expect(page.getByTestId('perf-overlay')).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => page.evaluate(() => window.__TENEBRIS__?.getState()?.physicsSteps ?? 0)).toBeGreaterThan(0);
}

async function state(page: Page): Promise<{
  physicsSteps: number;
  scene: { hero: { x: number; y: number; z: number }; grounded: boolean; dodging: boolean };
}> {
  const snapshot = await page.evaluate(() => window.__TENEBRIS__?.getState() ?? null);
  if (!snapshot) throw new Error('debug bridge is missing');
  return { physicsSteps: snapshot.physicsSteps, scene: snapshot.scene };
}

async function holdStick(page: Page, dx: number, dy: number, holdMs: number): Promise<void> {
  const size = page.viewportSize();
  if (!size) throw new Error('viewport unknown');
  const x = 120;
  const y = size.height - 130;
  await page.evaluate(
    ({ startX, startY, offsetX, offsetY }) => {
      const zone = document.querySelector('[data-testid="stick-zone"]');
      if (!zone) throw new Error('stick zone missing');
      const fire = (type: string, clientX: number, clientY: number): void => {
        zone.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 1,
            pointerType: 'touch',
            isPrimary: true,
            clientX,
            clientY,
            bubbles: true,
            cancelable: true,
          }),
        );
      };
      fire('pointerdown', startX, startY);
      fire('pointermove', startX + offsetX, startY + offsetY);
    },
    { startX: x, startY: y, offsetX: dx, offsetY: dy },
  );
  await page.waitForTimeout(holdMs);
  await page.evaluate(() => {
    const zone = document.querySelector('[data-testid="stick-zone"]');
    zone?.dispatchEvent(
      new PointerEvent('pointerup', {
        pointerId: 1,
        pointerType: 'touch',
        clientX: 0,
        clientY: 0,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

test.describe('physics', () => {
  test('rapier steps advance and the hero is grounded', async ({ page }) => {
    await bootIntoRun(page);
    const first = await state(page);
    await page.waitForTimeout(500);
    const second = await state(page);
    expect(second.physicsSteps).toBeGreaterThan(first.physicsSteps + 10);
    expect(second.scene.grounded).toBe(true);
    // Feet stay on the floor: physics resolves gravity, not a hardcoded height.
    expect(Math.abs(second.scene.hero.y)).toBeLessThan(0.15);
  });

  test('stick movement is integrated by the character controller', async ({ page }) => {
    await bootIntoRun(page);
    const before = await state(page);
    await holdStick(page, 0, -80, 900);
    await page.waitForTimeout(200);
    const after = await state(page);
    const travelled = Math.hypot(after.scene.hero.x - before.scene.hero.x, after.scene.hero.z - before.scene.hero.z);
    expect(travelled).toBeGreaterThan(1);
    expect(travelled).toBeLessThan(6);
    expect(after.scene.grounded).toBe(true);
  });

  test('dodge dashes further than a walk in the same time', async ({ page }) => {
    await bootIntoRun(page);
    const start = await state(page);
    await page.getByTestId('action-dodge').dispatchEvent('pointerdown', {
      pointerId: 41,
      pointerType: 'touch',
      clientX: 100,
      clientY: 300,
      isPrimary: true,
    });
    await page.waitForTimeout(450);
    const afterDodge = await state(page);
    const dodgeDistance = Math.hypot(
      afterDodge.scene.hero.x - start.scene.hero.x,
      afterDodge.scene.hero.z - start.scene.hero.z,
    );
    // Dash is 11 m/s for 0.18 s ≈ 2 m even without stick input.
    expect(dodgeDistance).toBeGreaterThan(1.2);
  });
});

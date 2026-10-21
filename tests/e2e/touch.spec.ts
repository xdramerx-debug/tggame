import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Multi-touch acceptance tests.
 *
 * Real multi-pointer gestures cannot be produced by `page.touchscreen` (single
 * pointer), and CDP touch dispatch is Chromium-only. The input layer consumes
 * PointerEvents exclusively, so synthetic PointerEvents with distinct
 * `pointerId`s exercise exactly the same code path on both engines.
 */

async function bootIntoRun(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('menu-Начать забег').click();
  await expect(page.getByTestId('game-canvas')).toBeVisible();
  await expect(page.getByTestId('perf-overlay')).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => page.evaluate(() => window.__TENEBRIS__?.getState()?.fps ?? 0)).toBeGreaterThan(0);
}

interface SceneState {
  hero: { x: number; y: number; z: number };
  attacks: number;
  collected: number;
  canInteract: boolean;
}

async function readState(page: Page): Promise<{
  camera: { yaw: number; pitch: number; distance: number };
  scene: SceneState;
}> {
  const state = await page.evaluate(() => window.__TENEBRIS__?.getState() ?? null);
  if (!state) throw new Error('debug bridge is not installed');
  return { camera: state.camera, scene: state.scene };
}

/** Dispatches a PointerEvent in the page (shared by all gesture helpers). */
async function pointer(
  page: Page,
  testId: string,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  pointerId: number,
  x: number,
  y: number,
): Promise<void> {
  await page.evaluate(
    ({ testId: id, type: eventType, pointerId: pid, x: clientX, y: clientY }) => {
      const element = document.querySelector(`[data-testid="${id}"]`);
      if (!element) throw new Error(`missing element ${id}`);
      element.dispatchEvent(
        new PointerEvent(eventType, {
          pointerId: pid,
          pointerType: 'touch',
          isPrimary: pid === 1,
          clientX,
          clientY,
          bubbles: true,
          cancelable: true,
          buttons: eventType === 'pointerup' ? 0 : 1,
        }),
      );
    },
    { testId, type, pointerId, x, y },
  );
}

test.describe('touch input', () => {
  test('three fingers: move, rotate the camera and attack at once', async ({ page }) => {
    await bootIntoRun(page);
    const initial = await readState(page);
    const size = page.viewportSize();
    if (!size) throw new Error('viewport is unknown');

    const stickX = 120;
    const stickY = size.height - 130;
    const cameraX = size.width - 180;
    const cameraY = Math.round(size.height * 0.3);

    // Finger 1 — stick: push forward.
    await pointer(page, 'stick-zone', 'pointerdown', 1, stickX, stickY);
    await pointer(page, 'stick-zone', 'pointermove', 1, stickX, stickY - 70);

    // Finger 2 — camera: horizontal swipe.
    await pointer(page, 'camera-zone', 'pointerdown', 2, cameraX, cameraY);
    await pointer(page, 'camera-zone', 'pointermove', 2, cameraX - 90, cameraY);

    // Finger 3 — attack button.
    await pointer(page, 'action-attack', 'pointerdown', 3, size.width - 60, size.height - 60);

    await page.waitForTimeout(600);
    const during = await readState(page);

    expect(during.scene.attacks).toBeGreaterThan(initial.scene.attacks);
    expect(Math.hypot(during.scene.hero.x - initial.scene.hero.x, during.scene.hero.z - initial.scene.hero.z)).toBeGreaterThan(0.2);
    expect(Math.abs(during.camera.yaw - initial.camera.yaw)).toBeGreaterThan(0.05);

    // Release everything: the hero must stop and no pointer must stay captured.
    await pointer(page, 'stick-zone', 'pointerup', 1, stickX, stickY - 70);
    await pointer(page, 'camera-zone', 'pointerup', 2, cameraX - 90, cameraY);
    await page.waitForTimeout(300);
    const stopped = await readState(page);
    await page.waitForTimeout(300);
    const later = await readState(page);
    expect(Math.hypot(later.scene.hero.x - stopped.scene.hero.x, later.scene.hero.z - stopped.scene.hero.z)).toBeLessThan(0.15);
  });

  test('attack button fires once and then respects its cooldown', async ({ page }) => {
    await bootIntoRun(page);
    const size = page.viewportSize();
    if (!size) throw new Error('viewport is unknown');
    const before = await readState(page);

    await pointer(page, 'action-attack', 'pointerdown', 11, size.width - 60, size.height - 60);
    await pointer(page, 'action-attack', 'pointerdown', 12, size.width - 60, size.height - 60);

    await page.waitForTimeout(120);
    const after = await readState(page);
    expect(after.scene.attacks).toBe(before.scene.attacks + 1);
    await expect(page.getByTestId('action-attack')).toHaveAttribute('data-cooling', 'true');
  });

  test('tap on the camera area attacks, long drag rotates instead', async ({ page }) => {
    await bootIntoRun(page);
    const size = page.viewportSize();
    if (!size) throw new Error('viewport is unknown');

    const before = await readState(page);
    const x = size.width - 120;
    const y = Math.round(size.height * 0.5);

    await pointer(page, 'camera-zone', 'pointerdown', 21, x, y);
    await pointer(page, 'camera-zone', 'pointerup', 21, x, y);
    await page.waitForTimeout(80);
    const afterTap = await readState(page);
    expect(afterTap.scene.attacks).toBe(before.scene.attacks + 1);

    await pointer(page, 'camera-zone', 'pointerdown', 22, x, y);
    await pointer(page, 'camera-zone', 'pointermove', 22, x - 120, y);
    await pointer(page, 'camera-zone', 'pointerup', 22, x - 120, y);
    await page.waitForTimeout(80);
    const afterDrag = await readState(page);
    expect(Math.abs(afterDrag.camera.yaw - afterTap.camera.yaw)).toBeGreaterThan(0.2);
  });

  test('pinch zooms the orbit camera', async ({ page }) => {
    await bootIntoRun(page);
    const size = page.viewportSize();
    if (!size) throw new Error('viewport is unknown');
    const before = await readState(page);
    const cx = size.width - 200;
    const cy = Math.round(size.height * 0.4);

    await pointer(page, 'camera-zone', 'pointerdown', 31, cx - 40, cy);
    await pointer(page, 'camera-zone', 'pointerdown', 32, cx + 40, cy);
    // Spread fingers apart → zoom out.
    await pointer(page, 'camera-zone', 'pointermove', 31, cx - 70, cy);
    await pointer(page, 'camera-zone', 'pointermove', 32, cx + 70, cy);
    await page.waitForTimeout(80);
    const after = await readState(page);
    expect(after.camera.distance).toBeGreaterThan(before.camera.distance);

    await pointer(page, 'camera-zone', 'pointerup', 31, cx - 70, cy);
    await pointer(page, 'camera-zone', 'pointerup', 32, cx + 70, cy);
  });

  test('every action button exposes a ≥48 px touch target', async ({ page }) => {
    await bootIntoRun(page);
    for (const id of ['action-attack', 'action-skill1', 'action-skill2', 'action-dodge']) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box, `${id} is not rendered`).not.toBeNull();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(48);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
    }
  });
});

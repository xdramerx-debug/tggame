import { expect, test } from '@playwright/test';
import { bootIntoRun as boot, pointer, readState, waitForPhysicsSteps } from './helpers';

/**
 * Multi-touch acceptance tests.
 *
 * Real multi-pointer gestures cannot be produced by `page.touchscreen` (single
 * pointer), and CDP touch dispatch is Chromium-only. The input layer consumes
 * PointerEvents exclusively, so synthetic PointerEvents with distinct
 * `pointerId`s exercise exactly the same code path on both engines.
 *
 * Movement is asserted in simulation steps, not wall-clock time: CI renders with
 * software WebGL, so a 600 ms wait may advance the fixed step by only a few ticks.
 */
const bootIntoRun = boot;

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

    await waitForPhysicsSteps(page, 20);
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
    // Spread fingers apart → camera moves closer (pinch-out zooms in), and the
    // distance shrinks by the per-event pinch factor, independent of walls.
    await pointer(page, 'camera-zone', 'pointermove', 31, cx - 70, cy);
    await pointer(page, 'camera-zone', 'pointermove', 32, cx + 70, cy);
    const closer = await readState(page);
    expect(closer.camera.distance).toBeLessThan(before.camera.distance);

    // Pinch back in → camera pulls away again.
    await pointer(page, 'camera-zone', 'pointermove', 31, cx - 20, cy);
    await pointer(page, 'camera-zone', 'pointermove', 32, cx + 20, cy);
    const farther = await readState(page);
    expect(farther.camera.distance).toBeGreaterThan(closer.camera.distance);

    await pointer(page, 'camera-zone', 'pointerup', 31, cx - 20, cy);
    await pointer(page, 'camera-zone', 'pointerup', 32, cx + 20, cy);
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

import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { DebugSceneSnapshot } from '@/types/scene';

/**
 * Shared E2E helpers.
 *
 * CI runs on software WebGL (SwiftShader): a frame can take hundreds of
 * milliseconds there, so any assertion expressed in wall-clock time is flaky by
 * construction. Every gameplay check therefore waits on the *simulation*
 * (`physicsSteps`, 60 Hz fixed step) instead of on timeouts, and boots the low
 * preset so the renderer is not the bottleneck.
 */

export type QualityParam = 'low' | 'medium' | 'high';

export interface BootOptions {
  readonly seed?: number;
  readonly quality?: QualityParam;
}

export interface DebugState {
  readonly camera: {
    readonly yaw: number;
    readonly pitch: number;
    readonly distance: number;
  };
  readonly scene: DebugSceneSnapshot;
  readonly quality: string;
  readonly fps: number;
  readonly physicsSteps: number;
}

/** Boots the app into a run with a pinned seed and quality tier. */
export async function bootIntoRun(page: Page, options: BootOptions = {}): Promise<void> {
  const params = new URLSearchParams();
  params.set('quality', options.quality ?? 'low');
  if (options.seed !== undefined) params.set('seed', String(options.seed));
  await page.goto(`/?${params.toString()}`);
  await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('menu-Начать забег').click();
  await expect(page.getByTestId('game-canvas')).toBeVisible();
  await expect(page.getByTestId('perf-overlay')).toBeVisible({ timeout: 20_000 });
  await waitForPhysicsSteps(page, 1);
}

export async function readState(page: Page): Promise<DebugState> {
  const state = await page.evaluate(() => window.__TENEBRIS__?.getState() ?? null);
  if (!state) throw new Error('debug bridge is missing');
  return state;
}

/** Resolves after the simulation advanced by `steps` fixed steps. */
export async function waitForPhysicsSteps(page: Page, steps: number, timeout = 30_000): Promise<void> {
  const start = await page.evaluate(() => window.__TENEBRIS__?.getState()?.physicsSteps ?? 0);
  await expect
    .poll(async () => page.evaluate(() => window.__TENEBRIS__?.getState()?.physicsSteps ?? 0), {
      timeout,
      intervals: [100, 200, 400],
    })
    .toBeGreaterThanOrEqual(start + steps);
}

/** Dispatches a PointerEvent on a test id (multi-touch needs distinct ids). */
export async function pointer(
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

/**
 * Pushes the virtual stick forward (or by an arbitrary offset) and holds it for
 * `steps` fixed steps.
 */
export async function holdStick(
  page: Page,
  steps: number,
  offset: { readonly x: number; readonly y: number } = { x: 0, y: -90 },
): Promise<void> {
  const size = page.viewportSize();
  if (!size) throw new Error('viewport unknown');
  const startX = 120;
  const startY = size.height - 130;
  await pointer(page, 'stick-zone', 'pointerdown', 1, startX, startY);
  await pointer(page, 'stick-zone', 'pointermove', 1, startX + offset.x, startY + offset.y);
  await waitForPhysicsSteps(page, steps);
  await pointer(page, 'stick-zone', 'pointerup', 1, startX + offset.x, startY + offset.y);
  // One more step so the stop is integrated.
  await waitForPhysicsSteps(page, 2);
}

/** Horizontal distance travelled between two snapshots. */
export function travelled(from: DebugState, to: DebugState): number {
  return Math.hypot(to.scene.hero.x - from.scene.hero.x, to.scene.hero.z - from.scene.hero.z);
}

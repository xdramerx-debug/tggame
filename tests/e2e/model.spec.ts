import { expect, test } from '@playwright/test';
import { bootIntoRun, pointer, readState, waitForPhysicsSteps } from './helpers';

/**
 * Stage-5 acceptance: the player is a generated GLB with a skeleton, and the
 * animation state follows gameplay input.
 *
 * The GLB files are build artifacts (`npm run assets`), so this suite also proves
 * the pipeline output is actually served and parsed by the browser.
 */
test.describe('generated hero model', () => {
  test('loads the GLB hero instead of the placeholder', async ({ page }) => {
    const failures: string[] = [];
    page.on('response', (response) => {
      if (response.url().includes('/assets/models/') && response.status() >= 400) {
        failures.push(`${response.status()} ${response.url()}`);
      }
    });
    await bootIntoRun(page, { seed: 4242 });
    const state = await readState(page);
    expect(state.scene.heroAsset).toBe('gltf');
    expect(state.scene.heroState).toBe('idle');
    expect(failures, `asset requests failed: ${failures.join(', ')}`).toHaveLength(0);
  });

  test('animation follows movement, attack and dodge', async ({ page }) => {
    await bootIntoRun(page);
    const size = page.viewportSize();
    if (!size) throw new Error('viewport unknown');

    // Walk: stick pushed forward.
    await pointer(page, 'stick-zone', 'pointerdown', 1, 120, size.height - 130);
    await pointer(page, 'stick-zone', 'pointermove', 1, 120, size.height - 220);
    await waitForPhysicsSteps(page, 25);
    const walking = await readState(page);
    expect(['walk', 'run']).toContain(walking.scene.heroState);
    await pointer(page, 'stick-zone', 'pointerup', 1, 120, size.height - 220);
    await waitForPhysicsSteps(page, 12);
    expect((await readState(page)).scene.heroState).toBe('idle');

    // Attack: the swing owns the body for the length of the clip.
    await pointer(page, 'action-attack', 'pointerdown', 2, size.width - 70, size.height - 70);
    await expect
      .poll(async () => (await readState(page)).scene.heroState, { timeout: 15_000, intervals: [100, 200] })
      .toBe('attack');
    await expect
      .poll(async () => (await readState(page)).scene.heroState, { timeout: 15_000, intervals: [200] })
      .toBe('idle');

    // Dodge has no hold state: it must at least register without errors.
    await pointer(page, 'action-dodge', 'pointerdown', 3, size.width - 150, size.height - 70);
    await waitForPhysicsSteps(page, 6);
    const afterDodge = await readState(page);
    expect(['dodge', 'idle']).toContain(afterDodge.scene.heroState);
  });
});

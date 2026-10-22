import { expect, test } from '@playwright/test';
import { bootIntoRun, holdStick, pointer, readState, waitForPhysicsSteps } from './helpers';

/**
 * Stage-6 acceptance: real-time combat is wired to the touch HUD.
 *
 * Kept deliberately about *observable* state (vitals, stamina cost, enemy
 * population) rather than about timings: CI renders on SwiftShader, so every
 * wait is expressed in fixed simulation steps.
 */
test.describe('combat', () => {
  test('exposes player vitals to the HUD', async ({ page }) => {
    await bootIntoRun(page, { seed: 4242 });
    const state = await readState(page);
    expect(state.scene.hp).toBe(100);
    expect(state.scene.maxHp).toBe(100);
    expect(state.scene.stamina).toBe(100);
    expect(state.scene.kills).toBe(0);
    expect(state.scene.deaths).toBe(0);
    // The HUD mirrors the simulation.
    await expect(page.getByTestId('floor-label')).toHaveText(/Этаж 1/);
  });

  test('a swing costs stamina and regenerates afterwards', async ({ page }) => {
    await bootIntoRun(page, { seed: 4242 });
    const size = page.viewportSize();
    if (!size) throw new Error('viewport unknown');

    await pointer(page, 'action-attack', 'pointerdown', 21, size.width - 60, size.height - 60);
    await pointer(page, 'action-attack', 'pointerup', 21, size.width - 60, size.height - 60);
    await waitForPhysicsSteps(page, 2);

    const spent = await readState(page);
    expect(spent.scene.attacks).toBeGreaterThan(0);
    expect(spent.scene.stamina).toBeLessThan(100);

    // Stamina must climb back: poll the simulation instead of assuming a
    // fixed number of steps fits in the CI frame budget (SwiftShader is slow).
    await expect
      .poll(async () => (await readState(page)).scene.stamina ?? 0, { timeout: 45_000, intervals: [250, 500, 1000] })
      .toBeGreaterThan(spent.scene.stamina ?? 0);
  });

  test('walking towards the next room brings enemies into the world', async ({ page }) => {
    await bootIntoRun(page, { seed: 11 });

    // Rooms are only populated once they come into range, and a doorway can stop
    // a straight line, so try a few directions before concluding the floor is
    // empty. Each attempt walks ~3 s of simulation.
    const directions = [
      { x: 0, y: -90 },
      { x: 90, y: 0 },
      { x: 0, y: 90 },
      { x: -90, y: 0 },
    ];
    let enemies = 0;
    for (const direction of directions) {
      await holdStick(page, 180, direction);
      await waitForPhysicsSteps(page, 20);
      enemies = (await readState(page)).scene.enemies ?? 0;
      if (enemies > 0) break;
    }

    expect(enemies).toBeGreaterThan(0);
    // Enemies are never infinite: the director caps the active population.
    expect(enemies).toBeLessThanOrEqual(6);
  });
});

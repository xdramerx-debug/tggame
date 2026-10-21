import { expect, test } from '@playwright/test';
import { bootIntoRun, holdStick, pointer, readState, travelled, waitForPhysicsSteps } from './helpers';

/**
 * Stage-3 acceptance: Rapier is running, the character is grounded and the
 * capsule is actually driven by the simulation (not by a kinematic clamp).
 *
 * Distances are measured over a fixed number of simulation steps, so the results
 * do not depend on the frame rate of the CI renderer.
 */
test.describe('physics', () => {
  test('rapier steps advance and the hero is grounded', async ({ page }) => {
    await bootIntoRun(page);
    const first = await readState(page);
    await waitForPhysicsSteps(page, 30);
    const second = await readState(page);
    expect(second.physicsSteps).toBeGreaterThan(first.physicsSteps + 10);
    expect(second.scene.grounded).toBe(true);
    // Feet stay on the floor: physics resolves gravity, not a hardcoded height.
    expect(Math.abs(second.scene.hero.y)).toBeLessThan(0.15);
  });

  test('stick movement is integrated by the character controller', async ({ page }) => {
    await bootIntoRun(page);
    const before = await readState(page);
    // 0.9 s of simulated time at 3.4 m/s ≈ 3 m, minus collision slack.
    await holdStick(page, 54);
    const after = await readState(page);
    const distance = travelled(before, after);
    expect(distance).toBeGreaterThan(0.8);
    expect(distance).toBeLessThan(4);
    expect(after.scene.grounded).toBe(true);
  });

  test('dodge dashes further than a walk in the same time', async ({ page }) => {
    await bootIntoRun(page);
    const start = await readState(page);
    const size = page.viewportSize();
    if (!size) throw new Error('viewport unknown');
    await pointer(page, 'action-dodge', 'pointerdown', 41, size.width - 80, size.height - 80);
    // The dash lasts 0.18 s ≈ 11 steps; give it 20 and let it finish.
    await waitForPhysicsSteps(page, 20);
    const afterDodge = await readState(page);
    const dodgeDistance = travelled(start, afterDodge);
    // Dash is 11 m/s for 0.18 s ≈ 2 m even without stick input.
    expect(dodgeDistance).toBeGreaterThan(1.2);
  });
});

/** One enrage step of a boss, triggered when health drops below `at`. */
export interface BossPhase {
  /** Health fraction (0…1) at or below which this phase is active. */
  readonly at: number;
  readonly speedMul: number;
  readonly damageMul: number;
  /** Multiplier for the recovery window: < 1 means faster follow-up swings. */
  readonly cooldownMul: number;
  /** Shown as a toast when the phase starts. */
  readonly taunt: string;
}

export interface BossTuning {
  readonly phases: readonly BossPhase[];
}

/**
 * Current enrage step for a health fraction.
 *
 * Phases are ordered from the *last* one (`at` closest to 0) to the first, so
 * the result is the first phase whose threshold the boss has fallen below.
 * With no phases, or a healthy boss, the neutral step (all multipliers 1) wins.
 */
export function phaseIndex(hpRatio: number, phases: readonly BossPhase[]): number {
  for (let index = phases.length - 1; index >= 0; index -= 1) {
    const phase = phases[index];
    if (phase && hpRatio <= phase.at) return index;
  }
  return -1;
}

export function phaseMultipliers(
  hpRatio: number,
  phases: readonly BossPhase[],
): { readonly speed: number; readonly damage: number; readonly cooldown: number; readonly index: number } {
  const index = phaseIndex(hpRatio, phases);
  const phase = index >= 0 ? phases[index] : undefined;
  if (!phase) return { speed: 1, damage: 1, cooldown: 1, index: -1 };
  return { speed: phase.speedMul, damage: phase.damageMul, cooldown: phase.cooldownMul, index };
}

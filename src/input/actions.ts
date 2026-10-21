import type { InputAction } from './types';

export interface ActionSpec {
  readonly id: InputAction;
  readonly label: string;
  /** Touch target in CSS px (spec: attack 76, skills/dodge 60, interact 56). */
  readonly size: number;
  readonly cooldownMs: number;
  /** Placeholder until skills exist (stage 6+). */
  readonly icon: string;
  readonly hint: string;
}

/**
 * Spec layout. Sizes are the *base* values: the S/M/L setting multiplies them.
 * Cooldowns are authoritative here until the combat system owns them (stage 6);
 * moving them later only changes where `CooldownTracker` gets its data.
 */
export const ACTION_SPECS: Readonly<Record<InputAction, ActionSpec>> = {
  attack: { id: 'attack', label: 'Атака', size: 76, cooldownMs: 450, icon: '⚔️', hint: 'Быстрый удар' },
  skill1: { id: 'skill1', label: 'Навык 1', size: 60, cooldownMs: 5000, icon: '🔥', hint: 'Огненный выпад' },
  skill2: { id: 'skill2', label: 'Навык 2', size: 60, cooldownMs: 7000, icon: '❄️', hint: 'Ледяная хватка' },
  dodge: { id: 'dodge', label: 'Уворот', size: 60, cooldownMs: 1200, icon: '🛡️', hint: 'Рывок с i-frames' },
  interact: { id: 'interact', label: 'Действие', size: 56, cooldownMs: 300, icon: '⚡', hint: 'Взаимодействие' },
};

/** Per-action readiness. Pure and testable: no timers, clock is injected. */
export class CooldownTracker {
  private readonly readyAt = new Map<InputAction, number>();

  /**
   * Attempts to use an action.
   * @returns true when the action fired (and its cooldown was started)
   */
  press(action: InputAction, nowMs: number, cooldownOverrideMs?: number): boolean {
    const spec = ACTION_SPECS[action];
    const ready = this.readyAt.get(action) ?? 0;
    if (nowMs < ready) return false;
    const cooldown = cooldownOverrideMs ?? spec.cooldownMs;
    this.readyAt.set(action, nowMs + cooldown);
    return true;
  }

  /** Remaining cooldown as a fraction of the total: 0 = ready, 1 = just fired. */
  remainingFraction(action: InputAction, nowMs: number): number {
    const ready = this.readyAt.get(action) ?? 0;
    const total = ACTION_SPECS[action].cooldownMs;
    const remaining = ready - nowMs;
    if (remaining <= 0 || total <= 0) return 0;
    return Math.min(1, remaining / total);
  }

  isReady(action: InputAction, nowMs: number): boolean {
    return nowMs >= (this.readyAt.get(action) ?? 0);
  }

  reset(): void {
    this.readyAt.clear();
  }
}

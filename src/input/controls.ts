import type { FrameInput } from '@/fight/types';

export type ActionButton = 'punch' | 'kick' | 'special' | 'super' | 'block';

const BUTTONS: readonly ActionButton[] = ['punch', 'kick', 'special', 'super', 'block'];

/**
 * Touch input state, independent of React.
 *
 * Buttons are *held* booleans; the simulation does its own edge detection, so a
 * fast tap and a long press behave the same way as on a real pad. The stick is
 * analogue but quantised to −1/0/1 because the fight simulation is 2.5D.
 */
export class InputController {
  private readonly held = new Map<ActionButton, boolean>();
  private stickX = 0;
  private stickY = 0;
  private readonly listeners = new Set<() => void>();
  private version = 0;

  constructor() {
    for (const button of BUTTONS) this.held.set(button, false);
  }

  get pressedVersion(): number {
    return this.version;
  }

  setButton(button: ActionButton, down: boolean): void {
    if ((this.held.get(button) ?? false) === down) return;
    this.held.set(button, down);
    this.version += 1;
    this.notify();
  }

  isDown(button: ActionButton): boolean {
    return this.held.get(button) ?? false;
  }

  setStick(x: number, y: number): void {
    const nextX = Math.abs(x) < 0.28 ? 0 : Math.sign(x);
    const nextY = Math.abs(y) < 0.36 ? 0 : Math.sign(y);
    if (nextX === this.stickX && nextY === this.stickY) return;
    this.stickX = nextX;
    this.stickY = nextY;
    this.version += 1;
    this.notify();
  }

  isMoving(): boolean {
    return this.stickX !== 0 || this.stickY !== 0;
  }

  sample(): FrameInput {
    return {
      horizontal: this.stickX === 0 ? 0 : this.stickX > 0 ? 1 : -1,
      vertical: this.stickY === 0 ? 0 : this.stickY > 0 ? 1 : -1,
      punch: this.isDown('punch'),
      kick: this.isDown('kick'),
      special: this.isDown('special'),
      super: this.isDown('super'),
      block: this.isDown('block'),
    };
  }

  clear(): void {
    let changed = false;
    for (const button of BUTTONS) {
      if (this.held.get(button) === true) {
        this.held.set(button, false);
        changed = true;
      }
    }
    if (this.stickX !== 0 || this.stickY !== 0) {
      this.stickX = 0;
      this.stickY = 0;
      changed = true;
    }
    if (changed) {
      this.version += 1;
      this.notify();
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

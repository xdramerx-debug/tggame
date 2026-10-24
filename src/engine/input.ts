/**
 * Touch-first input (§ mobile only): left half — dynamic virtual joystick,
 * right half — camera drag, DOM buttons for fire/dash/reload.
 * Pointer Events also cover mouse (desktop preview); hidden WASD fallback.
 */

export interface InputSnapshot {
  /** normalized move vector, y is forward (+1) */
  moveX: number;
  moveY: number;
  fireHeld: boolean;
  dashQueued: boolean;
  reloadQueued: boolean;
}

const JOYSTICK_RADIUS = 62;

export class InputManager {
  moveX = 0;
  moveY = 0;
  fireHeld = false;
  dashQueued = false;
  reloadQueued = false;
  /** camera look deltas, consumed each frame */
  lookX = 0;
  lookY = 0;

  private host: HTMLElement | null = null;
  private base: HTMLDivElement | null = null;
  private knob: HTMLDivElement | null = null;
  private pointers = new Map<number, { mode: 'move' | 'look'; ox: number; oy: number; lx: number; ly: number }>();
  private keys = new Set<string>();

  private readonly onDown = (e: PointerEvent): void => {
    if (!this.host) return;
    const rect = this.host.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < rect.width * 0.45 && !this.pointers.has(e.pointerId)) {
      this.pointers.set(e.pointerId, { mode: 'move', ox: x, oy: y, lx: x, ly: y });
      this.showStick(x, y);
      this.host.setPointerCapture(e.pointerId);
    } else if (!this.pointers.has(e.pointerId)) {
      this.pointers.set(e.pointerId, { mode: 'look', ox: x, oy: y, lx: x, ly: y });
      this.host.setPointerCapture(e.pointerId);
    }
    e.preventDefault();
  };

  private readonly onMove = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p || !this.host) return;
    const rect = this.host.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (p.mode === 'move') {
      const dx = x - p.ox;
      const dy = y - p.oy;
      const len = Math.hypot(dx, dy);
      const k = len > JOYSTICK_RADIUS ? JOYSTICK_RADIUS / len : 1;
      this.moveX = (dx * k) / JOYSTICK_RADIUS;
      this.moveY = (-dy * k) / JOYSTICK_RADIUS;
      this.moveStick(dx * k, dy * k);
    } else {
      this.lookX += x - p.lx;
      this.lookY += y - p.ly;
    }
    p.lx = x;
    p.ly = y;
    e.preventDefault();
  };

  private readonly onUp = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (p?.mode === 'move') {
      this.moveX = 0;
      this.moveY = 0;
      this.hideStick();
    }
    this.pointers.delete(e.pointerId);
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    this.keys.add(e.code);
    if (e.code === 'Space') { this.dashQueued = true; e.preventDefault(); }
    if (e.code === 'KeyR') this.reloadQueued = true;
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  attach(host: HTMLElement): void {
    this.host = host;
    host.style.touchAction = 'none';

    this.base = document.createElement('div');
    this.base.className = 'stick-base';
    this.knob = document.createElement('div');
    this.knob.className = 'stick-knob';
    this.base.appendChild(this.knob);
    host.appendChild(this.base);

    host.addEventListener('pointerdown', this.onDown);
    host.addEventListener('pointermove', this.onMove);
    host.addEventListener('pointerup', this.onUp);
    host.addEventListener('pointercancel', this.onUp);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  detach(): void {
    if (!this.host) return;
    this.host.removeEventListener('pointerdown', this.onDown);
    this.host.removeEventListener('pointermove', this.onMove);
    this.host.removeEventListener('pointerup', this.onUp);
    this.host.removeEventListener('pointercancel', this.onUp);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.base?.remove();
    this.base = null;
    this.knob = null;
    this.host = null;
    this.pointers.clear();
  }

  /** Keyboard (WASD/arrows) folded into the move vector — desktop preview only. */
  read(): InputSnapshot {
    let mx = this.moveX;
    let my = this.moveY;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) my = Math.max(my, 1);
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) my = Math.min(my, -1);
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx = Math.min(mx, -1);
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx = Math.max(mx, 1);
    return { moveX: mx, moveY: my, fireHeld: this.fireHeld, dashQueued: this.dashQueued, reloadQueued: this.reloadQueued };
  }

  consumeLook(): { x: number; y: number } {
    const out = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return out;
  }

  consumeDash(): boolean {
    const d = this.dashQueued;
    this.dashQueued = false;
    return d;
  }

  consumeReload(): boolean {
    const r = this.reloadQueued;
    this.reloadQueued = false;
    return r;
  }

  private showStick(x: number, y: number): void {
    if (!this.base || !this.knob) return;
    this.base.style.display = 'block';
    this.base.style.left = `${x}px`;
    this.base.style.top = `${y}px`;
    this.knob.style.transform = 'translate(-50%, -50%)';
  }

  private moveStick(dx: number, dy: number): void {
    if (!this.knob) return;
    this.knob.style.transform = `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${dy.toFixed(1)}px))`;
  }

  private hideStick(): void {
    if (this.base) this.base.style.display = 'none';
  }
}

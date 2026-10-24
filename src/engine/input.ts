/**
 * Ввод «Хамсина»: левая зона — динамический джойстик (край = спринт),
 * правая зона — свайп-прицел, кнопки вызывают методы напрямую из React.
 * Клавиатура/мышь — десктопный фолбэк.
 */

export interface InputSnapshot {
  moveX: number;
  moveY: number;
  sprint: boolean;
  fireHeld: boolean;
  crouched: boolean;
}

interface Queued {
  jump: boolean;
  reload: boolean;
  grenade: boolean;
  medkit: boolean;
  dash: boolean;
  crouchToggle: boolean;
  pause: boolean;
}

const JOY_RADIUS = 62;
const SPRINT_EDGE = 0.92;

export class InputManager {
  lookSensitivity = 0.0034;
  private left: HTMLElement | null = null;
  private right: HTMLElement | null = null;
  private joyId = -1;
  private lookId = -1;
  private joyOrigin = { x: 0, y: 0 };
  private move = { x: 0, y: 0 };
  private mag = 0;
  private look = { dx: 0, dy: 0 };
  private keys = new Set<string>();
  private mouseLookDown = false;
  private fireHeld = false;
  private crouched = false;
  private queued: Queued = {
    jump: false, reload: false, grenade: false, medkit: false,
    dash: false, crouchToggle: false, pause: false,
  };

  private onDown = (zone: 'left' | 'right', e: PointerEvent): void => {
    if (zone === 'left') {
      if (this.joyId >= 0) return;
      this.joyId = e.pointerId;
      this.joyOrigin = { x: e.clientX, y: e.clientY };
      this.move = { x: 0, y: 0 };
      this.mag = 0;
      e.preventDefault();
    } else {
      if (this.lookId >= 0) return;
      this.lookId = e.pointerId;
      this.lastLookX = e.clientX;
      this.lastLookY = e.clientY;
      e.preventDefault();
    }
  };

  private leftDown = (e: PointerEvent): void => { this.onDown('left', e); };
  private rightDown = (e: PointerEvent): void => { this.onDown('right', e); };
  private noMenu = (e: Event): void => { e.preventDefault(); };

  private onMove = (e: PointerEvent): void => {
    if (e.pointerId === this.joyId) {
      const dx = e.clientX - this.joyOrigin.x;
      const dy = e.clientY - this.joyOrigin.y;
      const dist = Math.hypot(dx, dy);
      this.mag = Math.min(1, dist / JOY_RADIUS);
      if (dist > 6) {
        this.move = { x: (dx / dist) * this.mag, y: (dy / dist) * this.mag };
      } else {
        this.move = { x: 0, y: 0 };
      }
      e.preventDefault();
    } else if (e.pointerId === this.lookId) {
      this.look.dx += e.movementX || e.clientX - (this.lastLookX ?? e.clientX);
      this.look.dy += e.movementY || e.clientY - (this.lastLookY ?? e.clientY);
      this.lastLookX = e.clientX;
      this.lastLookY = e.clientY;
      e.preventDefault();
    }
  };

  private lastLookX: number | null = null;
  private lastLookY: number | null = null;

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId === this.joyId) {
      this.joyId = -1;
      this.move = { x: 0, y: 0 };
      this.mag = 0;
    } else if (e.pointerId === this.lookId) {
      this.lookId = -1;
      this.lastLookX = null;
      this.lastLookY = null;
    }
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    this.keys.add(e.code);
    switch (e.code) {
      case 'Space': this.queued.jump = true; e.preventDefault(); break;
      case 'KeyR': this.queued.reload = true; break;
      case 'KeyG': this.queued.grenade = true; break;
      case 'KeyH': this.queued.medkit = true; break;
      case 'KeyQ': this.queued.dash = true; break;
      case 'KeyC': this.queued.crouchToggle = true; break;
      case 'Escape': case 'KeyP': this.queued.pause = true; break;
      default: break;
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (e.button === 0) this.fireHeld = true;
    if (e.button === 2) this.mouseLookDown = true;
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) this.fireHeld = false;
    if (e.button === 2) this.mouseLookDown = false;
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (this.mouseLookDown) {
      this.look.dx += e.movementX;
      this.look.dy += e.movementY;
    }
  };

  private onBlur = (): void => {
    this.keys.clear();
    this.fireHeld = false;
    this.mouseLookDown = false;
    this.joyId = -1;
    this.lookId = -1;
    this.move = { x: 0, y: 0 };
  };

  attach(left: HTMLElement, right: HTMLElement, canvas: HTMLElement): void {
    this.detach();
    this.left = left;
    this.right = right;
    left.addEventListener('pointerdown', this.leftDown);
    right.addEventListener('pointerdown', this.rightDown);
    right.addEventListener('contextmenu', this.noMenu);
    window.addEventListener('pointermove', this.onMove, { passive: false });
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
  }

  detach(): void {
    if (this.left) this.left.removeEventListener('pointerdown', this.leftDown);
    if (this.right) this.right.removeEventListener('pointerdown', this.rightDown);
    if (this.right) this.right.removeEventListener('contextmenu', this.noMenu);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    this.left = null;
    this.right = null;
  }

  snapshot(): InputSnapshot {
    let mx = this.move.x;
    let my = -this.move.y; // экранный Y вниз → «вперёд» положителен
    let sprint = this.mag > SPRINT_EDGE;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) my += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) my -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (k.has('ShiftLeft') || k.has('ShiftRight')) sprint = true;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    return {
      moveX: mx,
      moveY: my,
      sprint,
      fireHeld: this.fireHeld || k.has('Enter'),
      crouched: this.crouched,
    };
  }

  consumeLook(): { dx: number; dy: number } {
    const d = { dx: this.look.dx * this.lookSensitivity, dy: this.look.dy * this.lookSensitivity };
    this.look.dx = 0;
    this.look.dy = 0;
    return d;
  }

  takeQueued(): Queued {
    const q = { ...this.queued };
    this.queued = {
      jump: false, reload: false, grenade: false, medkit: false,
      dash: false, crouchToggle: false, pause: false,
    };
    return q;
  }

  setFire(v: boolean): void { this.fireHeld = v; }
  pressJump(): void { this.queued.jump = true; }
  pressCrouch(): void { this.queued.crouchToggle = true; }
  pressReload(): void { this.queued.reload = true; }
  pressGrenade(): void { this.queued.grenade = true; }
  pressMedkit(): void { this.queued.medkit = true; }
  pressDash(): void { this.queued.dash = true; }
  pressPause(): void { this.queued.pause = true; }
  applyCrouch(v: boolean): void { this.crouched = v; }
}

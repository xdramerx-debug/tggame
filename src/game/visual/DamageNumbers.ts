import { CanvasTexture, Sprite, SpriteMaterial } from 'three';
import type { Object3D } from 'three';

interface Popup {
  readonly sprite: Sprite;
  readonly material: SpriteMaterial;
  readonly texture: CanvasTexture;
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D | null;
  life: number;
  readonly maxLife: number;
  readonly rise: number;
}

const POOL_SIZE = 12;
const WIDTH = 128;
const HEIGHT = 64;

/**
 * Floating damage numbers in world space.
 *
 * Sprites are pooled and each keeps its own canvas + texture, so a hit only
 * redraws 128×64 pixels and uploads one small texture — far cheaper on mobile
 * GPUs than 12 extra DOM nodes being layouted while the player fights. Numbers
 * drift up and fade out over ~0.7 s and never block input because they live in
 * the 3D scene.
 */
export class DamageNumbers {
  private readonly popups: Popup[] = [];

  constructor(parent: Object3D) {
    for (let i = 0; i < POOL_SIZE; i += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      const texture = new CanvasTexture(canvas);
      texture.needsUpdate = false;
      const material = new SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        opacity: 0,
      });
      const sprite = new Sprite(material);
      sprite.scale.set(0.9, 0.45, 1);
      sprite.visible = false;
      sprite.renderOrder = 999;
      parent.add(sprite);
      this.popups.push({
        sprite,
        material,
        texture,
        canvas,
        context: canvas.getContext('2d'),
        life: 0,
        maxLife: 0.7,
        rise: 1.1,
      });
    }
  }

  /** Shows `value` above a world position; `critical` bumps size and colour. */
  show(position: { x: number; y: number; z: number }, value: number, critical = false): void {
    const popup = this.popups.find((candidate) => !candidate.sprite.visible) ?? this.popups[0];
    if (!popup) return;

    const context = popup.context;
    if (context) {
      context.clearRect(0, 0, WIDTH, HEIGHT);
      context.font = `bold ${critical ? 46 : 36}px ui-sans-serif, system-ui, sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.lineWidth = 6;
      context.strokeStyle = 'rgba(0, 0, 0, 0.85)';
      context.strokeText(String(value), WIDTH / 2, HEIGHT / 2);
      context.fillStyle = critical ? '#ffd166' : '#f2f5f8';
      context.fillText(String(value), WIDTH / 2, HEIGHT / 2);
      popup.texture.needsUpdate = true;
    }

    popup.sprite.position.set(position.x, position.y, position.z);
    popup.sprite.scale.set(critical ? 1.15 : 0.9, critical ? 0.58 : 0.45, 1);
    popup.sprite.visible = true;
    popup.material.opacity = 1;
    popup.life = popup.maxLife;
  }

  update(dt: number): void {
    for (const popup of this.popups) {
      if (!popup.sprite.visible) continue;
      popup.life -= dt;
      if (popup.life <= 0) {
        popup.sprite.visible = false;
        popup.material.opacity = 0;
        continue;
      }
      const progress = popup.life / popup.maxLife;
      popup.sprite.position.y += popup.rise * dt;
      // Pop in quickly, then fade over the remaining life.
      popup.material.opacity = Math.min(1, progress * 2.2);
    }
  }

  dispose(): void {
    for (const popup of this.popups) {
      popup.sprite.removeFromParent();
      popup.texture.dispose();
      popup.material.dispose();
    }
    this.popups.length = 0;
  }
}

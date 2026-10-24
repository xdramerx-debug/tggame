import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/game/rng';
import {
  DROP_CHANCES, POWERUP_EFFECT, POWERUP_LABEL, TOTAL_DROP_CHANCE, rollDrop,
} from '../../src/game/powerups';

const constRng = (v: number) => () => v;

describe('rollDrop', () => {
  it('границы интервалов: health → ammo → rapid → null', () => {
    expect(rollDrop(constRng(0))).toBe('health');
    expect(rollDrop(constRng(0.119))).toBe('health');
    expect(rollDrop(constRng(0.12))).toBe('ammo');
    expect(rollDrop(constRng(0.219))).toBe('ammo');
    expect(rollDrop(constRng(0.22))).toBe('rapid');
    expect(rollDrop(constRng(0.279))).toBe('rapid');
    expect(rollDrop(constRng(0.28))).toBeNull();
    expect(rollDrop(constRng(0.99))).toBeNull();
  });

  it('суммарный шанс дропа совпадает с суммой шансов', () => {
    expect(TOTAL_DROP_CHANCE).toBeCloseTo(DROP_CHANCES.health + DROP_CHANCES.ammo + DROP_CHANCES.rapid);
    expect(TOTAL_DROP_CHANCE).toBeLessThan(1);
  });

  it('на 20 000 бросках сид-rng доля дропов ≈ TOTAL_DROP_CHANCE', () => {
    const rng = createRng(42);
    let drops = 0;
    const n = 20000;
    const counts = { health: 0, ammo: 0, rapid: 0 };
    for (let i = 0; i < n; i++) {
      const d = rollDrop(rng);
      if (d) {
        drops++;
        counts[d]++;
      }
    }
    expect(drops / n).toBeGreaterThan(TOTAL_DROP_CHANCE - 0.02);
    expect(drops / n).toBeLessThan(TOTAL_DROP_CHANCE + 0.02);
    // health чаще всего, rapid реже всего
    expect(counts.health).toBeGreaterThan(counts.ammo);
    expect(counts.ammo).toBeGreaterThan(counts.rapid);
  });
});

describe('POWERUP_EFFECT / LABEL', () => {
  it('эффекты заданы для всех видов', () => {
    expect(POWERUP_EFFECT.health.hp).toBeGreaterThan(0);
    expect(POWERUP_EFFECT.ammo.refillMag).toBe(true);
    expect(POWERUP_EFFECT.rapid.durationS).toBeGreaterThan(0);
    expect(POWERUP_EFFECT.rapid.fireIntervalMult).toBeLessThan(1);
    expect(POWERUP_EFFECT.rapid.damageMult).toBeGreaterThan(1);
    for (const kind of ['health', 'ammo', 'rapid'] as const) {
      expect(POWERUP_LABEL[kind].length).toBeGreaterThan(0);
      expect(DROP_CHANCES[kind]).toBeGreaterThan(0);
    }
  });
});

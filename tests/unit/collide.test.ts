import { describe, expect, it } from 'vitest';
import {
  buildCollider, hasLOS, insideAny, rayBlock, resolveCircle, supportHeight,
} from '../../src/engine/collide';
import { OBSTACLES } from '../../src/game/map';
import type { BoxObstacle, CylObstacle } from '../../src/game/map';

const box = (x: number, z: number, hw: number, hd: number, h: number): BoxObstacle =>
  ({ kind: 'box', x, z, hw, hd, h, mat: 'crate' });
const cyl = (x: number, z: number, r: number, h: number): CylObstacle =>
  ({ kind: 'cyl', x, z, r, h, mat: 'metal' });

describe('buildCollider', () => {
  it('разделяет боксы и цилиндры карты', () => {
    const col = buildCollider(OBSTACLES);
    expect(col.boxes.length).toBeGreaterThan(20);
    expect(col.cyls.length).toBeGreaterThan(5);
    const merged = buildCollider([box(0, 0, 1, 1, 2), cyl(4, 0, 0.5, 1)]);
    expect(merged.boxes.length).toBe(1);
    expect(merged.cyls.length).toBe(1);
  });
});

describe('resolveCircle', () => {
  const col = buildCollider([box(0, 0, 2, 1, 3), cyl(8, 0, 1, 2)]);

  it('выталкивает из бокса наружу', () => {
    const r = resolveCircle(1.5, 0, 0.5, col, 40);
    expect(r.x).toBeCloseTo(2.5);
    expect(r.z).toBeCloseTo(0);
  });

  it('точка снаружи не двигается', () => {
    const r = resolveCircle(5, 5, 0.5, col, 40);
    expect(r.x).toBe(5);
    expect(r.z).toBe(5);
  });

  it('центр внутри бокса → выталкивание по кратчайшей оси', () => {
    const r = resolveCircle(0, 0.4, 0.4, col, 40);
    expect(r.z).toBeCloseTo(1.4); // ближе к южной грани (hd=1)
  });

  it('выталкивает из цилиндра', () => {
    const r = resolveCircle(7.6, 0, 0.5, col, 40);
    expect(Math.hypot(r.x - 8, r.z)).toBeCloseTo(1.5);
  });

  it('bound удерживает внутри арены', () => {
    const r = resolveCircle(45, 45, 0.5, col, 40);
    expect(r.x).toBeCloseTo(39.5);
    expect(r.z).toBeCloseTo(39.5);
  });
});

describe('rayBlock', () => {
  const col = buildCollider([box(0, 0, 1, 1, 3), box(0, 6, 1, 1, 0.9), cyl(6, 0, 1, 2)]);

  it('попадает в высокий бокс, t корректен', () => {
    const t = rayBlock(-5, 0, 1, 0, 20, col);
    expect(t).toBeCloseTo(4); // грань x=-1
  });

  it('низкие препятствия (h≤minHeight) пули перелетают', () => {
    expect(rayBlock(0, 2, 0, 1, 20, col)).toBeNull(); // бокс h0.9 в (0,6)
    expect(rayBlock(0, 2, 0, 1, 20, col, 0.5)).toBeCloseTo(3);
  });

  it('промах мимо всех', () => {
    expect(rayBlock(-5, 4, 1, 0, 20, col)).toBeNull();
  });

  it('цилиндр блокирует', () => {
    const t = rayBlock(2, 0, 1, 0, 20, col);
    expect(t).toBeCloseTo(3); // 6−1 −2 =3
  });

  it('maxT ограничивает дальность', () => {
    expect(rayBlock(-5, 0, 1, 0, 3, col)).toBeNull();
  });

  it('луч изнутри бокса даёт t=0', () => {
    expect(rayBlock(0, 0, 1, 0, 10, col)).toBe(0);
  });
});

describe('hasLOS', () => {
  const col = buildCollider([box(0, 0, 1, 1, 3)]);
  it('стена блокирует', () => {
    expect(hasLOS(-4, 0, 4, 0, col)).toBe(false);
  });
  it('вокруг стены — видит', () => {
    expect(hasLOS(-4, 4, 4, 4, col)).toBe(true);
  });
  it('та же точка — видит', () => {
    expect(hasLOS(2, 2, 2, 2, col)).toBe(true);
  });
});

describe('supportHeight', () => {
  const col = buildCollider([box(0, 0, 2, 2, 1.2), cyl(6, 0, 1, 1.05)]);

  it('на боксе — его верх', () => {
    expect(supportHeight(0, 0, col, 2)).toBeCloseTo(1.2);
  });
  it('на цилиндре — его верх', () => {
    expect(supportHeight(6, 0, col, 2)).toBeCloseTo(1.05);
  });
  it('вне препятствий — 0', () => {
    expect(supportHeight(20, 20, col, 2)).toBe(0);
  });
  it('слишком высокое не считается опорой', () => {
    expect(supportHeight(0, 0, col, 1.0)).toBe(0);
  });
});

describe('insideAny', () => {
  const col = buildCollider([box(0, 0, 1, 1, 3), cyl(5, 0, 1, 2)]);
  it('внутри бокса/цилиндра и рядом (pad)', () => {
    expect(insideAny(0.5, 0.5, col)).toBe(true);
    expect(insideAny(1.4, 0, col)).toBe(false);
    expect(insideAny(1.4, 0, col, 0.5)).toBe(true);
    expect(insideAny(5.5, 0, col)).toBe(true);
    expect(insideAny(9, 9, col)).toBe(false);
  });
});

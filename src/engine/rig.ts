import * as THREE from 'three';
import type { EnemyKind, WeaponId } from '../game/types';

/**
 * Риги «Хамсина»: солдаты (4 класса), титан, плевун и вьюмодель оружия
 * от первого лица. Всё из боксов/сфер/цилиндров, геометрия шарится
 * (кэш), материалы — на каждый риг свои (вспышка урона по emissive).
 */

type Disposable = THREE.BufferGeometry | THREE.Material | THREE.Texture;

interface GeoCache {
  box: THREE.BoxGeometry;
  sphere: THREE.SphereGeometry;
  cyl: THREE.CylinderGeometry;
}

let cache: GeoCache | null = null;

function geo(): GeoCache {
  cache ??= {
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(0.5, 12, 9),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  };
  return cache;
}

export function disposeRigCache(): void {
  cache?.box.dispose();
  cache?.sphere.dispose();
  cache?.cyl.dispose();
  cache = null;
}

export interface RigParts {
  root: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
}

export interface EnemyRig {
  kind: EnemyKind;
  parts: RigParts;
  /** дуло оружия (мишень для трассеров), null у мутантов без ствола */
  muzzle: THREE.Object3D | null;
  /** красный луч снайпера */
  laser: THREE.Mesh | null;
  /** светящийся мешок плевуна */
  sac: THREE.Mesh | null;
  /** материалы тела для вспышки урона */
  bodyMats: THREE.MeshLambertMaterial[];
  disposables: Disposable[];
  /** рост в локальных единицах (до scale) */
  height: number;
  headY: number;
  headR: number;
}

function lam(color: number, emissive = 0x000000, opacity = 1): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ color, emissive });
  if (opacity < 1) {
    m.transparent = true;
    m.opacity = opacity;
  }
  return m;
}

function box(
  parent: THREE.Group, w: number, h: number, d: number,
  x: number, y: number, z: number, mat: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geo().box, mat);
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function sphere(
  parent: THREE.Group, r: number, x: number, y: number, z: number, mat: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geo().sphere, mat);
  mesh.scale.setScalar(r * 2);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function cyl(
  parent: THREE.Group, r: number, h: number, x: number, y: number, z: number, mat: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geo().cyl, mat);
  mesh.scale.set(r * 2, h, r * 2);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

interface SoldierColors { skin: number; cloth: number; gear: number; eye: number; }

function buildSoldier(kind: EnemyKind, c: SoldierColors): EnemyRig {
  const disposables: Disposable[] = [];
  const mk = (color: number, emissive = 0x000000, opacity = 1): THREE.MeshLambertMaterial => {
    const m = lam(color, emissive, opacity);
    disposables.push(m);
    return m;
  };
  const skin = mk(c.skin);
  const cloth = mk(c.cloth);
  const gear = mk(c.gear);
  const eye = mk(c.eye, c.eye, 1);
  const metal = mk(0x2e2b26);

  const root = new THREE.Group();
  const torso = new THREE.Group();
  torso.position.set(0, 0.92, 0);
  root.add(torso);
  box(torso, 0.42, 0.58, 0.24, 0, 0.29, 0, cloth);
  box(torso, 0.44, 0.14, 0.26, 0, 0.1, 0, gear); // ремень/разгрузка
  box(torso, 0.3, 0.22, 0.1, 0, 0.42, 0.13, gear); // бронежилет спереди

  const head = new THREE.Group();
  head.position.set(0, 0.64, 0);
  torso.add(head);
  sphere(head, 0.125, 0, 0.1, 0, skin);
  box(head, 0.27, 0.09, 0.29, 0, 0.17, 0, gear); // каска
  box(head, 0.18, 0.05, 0.03, 0, 0.1, 0.12, eye); // визор/глаза

  const mkArm = (side: number): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(0.27 * side, 0.5, 0);
    torso.add(g);
    box(g, 0.11, 0.5, 0.12, 0, -0.25, 0, cloth);
    box(g, 0.1, 0.14, 0.1, 0, -0.54, 0, skin);
    return g;
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);

  const mkLeg = (side: number): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(0.11 * side, 0.9, 0);
    root.add(g);
    box(g, 0.15, 0.8, 0.16, 0, -0.4, 0, cloth);
    box(g, 0.16, 0.1, 0.26, 0, -0.84, 0.04, gear); // ботинок
    return g;
  };
  const legL = mkLeg(-1);
  const legR = mkLeg(1);

  // оружие у солдатских классов, морда смотрит на +Z
  let muzzle: THREE.Object3D | null = null;
  let laser: THREE.Mesh | null = null;
  if (kind !== 'grunt') {
    const gun = new THREE.Group();
    gun.position.set(0.14, 0.4, 0.16);
    torso.add(gun);
    if (kind === 'rifleman') {
      box(gun, 0.06, 0.1, 0.5, 0, 0, 0.15, metal);
      box(gun, 0.05, 0.16, 0.08, 0, -0.1, 0.08, gear); // магазин
      muzzle = new THREE.Object3D();
      muzzle.position.set(0, 0.01, 0.45);
      gun.add(muzzle);
    } else if (kind === 'shotgunner') {
      box(gun, 0.08, 0.09, 0.44, 0, 0, 0.12, metal);
      cyl(gun, 0.03, 0.4, 0, 0.03, 0.2, metal).rotation.x = Math.PI / 2;
      muzzle = new THREE.Object3D();
      muzzle.position.set(0, 0.03, 0.42);
      gun.add(muzzle);
    } else if (kind === 'sniper') {
      box(gun, 0.055, 0.09, 0.72, 0, 0, 0.25, metal);
      cyl(gun, 0.03, 0.22, 0, 0.09, 0.18, gear).rotation.x = Math.PI / 2; // прицел
      muzzle = new THREE.Object3D();
      muzzle.position.set(0, 0, 0.66);
      gun.add(muzzle);
      const lmat = lam(0xff2a1a, 0xff2a1a, 0.4);
      disposables.push(lmat);
      laser = new THREE.Mesh(geo().cyl, lmat);
      laser.scale.set(0.016, 20, 0.016);
      laser.position.set(0, 0, 20.7);
      laser.rotation.x = Math.PI / 2;
      laser.visible = false;
      gun.add(laser);
    }
    // руки к оружию
    armR.rotation.x = -1.35;
    armL.rotation.x = -1.2;
    armL.rotation.z = 0.35;
  } else {
    box(torso, 0.05, 0.1, 0.2, 0.16, 0.38, 0.2, metal); // пистолет
    muzzle = new THREE.Object3D();
    muzzle.position.set(0.16, 0.4, 0.32);
    torso.add(muzzle);
    armR.rotation.x = -1.3;
  }

  return {
    kind,
    parts: { root, torso, head, armL, armR, legL, legR },
    muzzle,
    laser,
    sac: null,
    bodyMats: [skin, cloth, gear],
    disposables,
    height: 1.78,
    headY: 1.66,
    headR: 0.17,
  };
}

function buildTitan(): EnemyRig {
  const disposables: Disposable[] = [];
  const mk = (color: number, emissive = 0x000000): THREE.MeshLambertMaterial => {
    const m = lam(color, emissive);
    disposables.push(m);
    return m;
  };
  const hide = mk(0x7a4a30);
  const plate = mk(0x4c3a28);
  const eye = mk(0xff7a1a, 0xff5a00);

  const root = new THREE.Group();
  const torso = new THREE.Group();
  torso.position.set(0, 0.78, 0);
  torso.rotation.x = 0.28; // сутулость
  root.add(torso);
  box(torso, 1.0, 0.82, 0.58, 0, 0.4, 0, hide);
  box(torso, 1.06, 0.3, 0.62, 0, 0.66, -0.02, plate); // надплечья
  box(torso, 0.5, 0.3, 0.2, 0, 0.3, 0.3, plate); // грудь-броня

  const head = new THREE.Group();
  head.position.set(0, 0.86, 0.14);
  torso.add(head);
  box(head, 0.38, 0.32, 0.36, 0, 0.1, 0, hide);
  box(head, 0.3, 0.1, 0.08, 0, 0.12, 0.2, eye);
  box(head, 0.34, 0.08, 0.12, 0, -0.06, 0.2, plate); // челюсть

  const mkArm = (side: number): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(0.62 * side, 0.62, 0);
    torso.add(g);
    box(g, 0.22, 0.78, 0.24, 0, -0.38, 0, hide);
    box(g, 0.3, 0.3, 0.32, 0, -0.88, 0.02, plate); // кулак
    return g;
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);

  const mkLeg = (side: number): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(0.26 * side, 0.78, 0);
    root.add(g);
    box(g, 0.28, 0.62, 0.3, 0, -0.32, 0, hide);
    box(g, 0.3, 0.16, 0.44, 0, -0.7, 0.06, plate);
    return g;
  };
  const legL = mkLeg(-1);
  const legR = mkLeg(1);

  return {
    kind: 'titan',
    parts: { root, torso, head, armL, armR, legL, legR },
    muzzle: null,
    laser: null,
    sac: null,
    bodyMats: [hide, plate],
    disposables,
    height: 2.3,
    headY: 1.78,
    headR: 0.3,
  };
}

function buildSpitter(): EnemyRig {
  const disposables: Disposable[] = [];
  const mk = (color: number, emissive = 0x000000, opacity = 1): THREE.MeshLambertMaterial => {
    const m = lam(color, emissive, opacity);
    disposables.push(m);
    return m;
  };
  const hide = mk(0x5f7a34);
  const belly = mk(0x87a04a);
  const eye = mk(0xf5e663, 0xd9c22e);
  const sacMat = mk(0x9fd93a, 0x6fa020, 0.92);

  const root = new THREE.Group();
  const torso = new THREE.Group();
  torso.position.set(0, 0.66, 0);
  torso.rotation.x = 0.42; // сильно сутулый
  root.add(torso);
  box(torso, 0.6, 0.52, 0.44, 0, 0.26, 0, hide);
  sphere(torso, 0.28, 0, 0.22, -0.24, belly); // пузо
  const sac = sphere(torso, 0.24, 0, 0.42, -0.3, sacMat); // кислотный мешок

  const head = new THREE.Group();
  head.position.set(0, 0.5, 0.16);
  torso.add(head);
  sphere(head, 0.2, 0, 0.12, 0, hide);
  box(head, 0.26, 0.08, 0.16, 0, 0.02, 0.18, belly); // пасть
  box(head, 0.22, 0.05, 0.04, 0, 0.18, 0.17, eye);

  const mkArm = (side: number): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(0.36 * side, 0.4, 0);
    torso.add(g);
    box(g, 0.1, 0.62, 0.1, 0, -0.3, 0, hide);
    box(g, 0.12, 0.1, 0.16, 0, -0.64, 0.02, belly);
    return g;
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);

  const mkLeg = (side: number): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(0.16 * side, 0.66, 0);
    root.add(g);
    box(g, 0.14, 0.52, 0.16, 0, -0.26, 0, hide);
    box(g, 0.16, 0.08, 0.26, 0, -0.56, 0.04, belly);
    return g;
  };
  const legL = mkLeg(-1);
  const legR = mkLeg(1);

  return {
    kind: 'spitter',
    parts: { root, torso, head, armL, armR, legL, legR },
    muzzle: head, // плюёт «ртом»
    laser: null,
    sac,
    bodyMats: [hide, belly],
    disposables,
    height: 1.45,
    headY: 1.22,
    headR: 0.24,
  };
}

export function buildEnemyRig(kind: EnemyKind, colors: { skin: number; cloth: number; gear: number; eye: number }): EnemyRig {
  switch (kind) {
    case 'titan': return buildTitan();
    case 'spitter': return buildSpitter();
    default: return buildSoldier(kind, colors);
  }
}

export function disposeRig(rig: EnemyRig): void {
  rig.parts.root.removeFromParent();
  for (const d of rig.disposables) d.dispose();
  rig.disposables.length = 0;
}

/* ---------- анимации (чистые функции от времени) ---------- */

export function animWalk(rig: EnemyRig, t: number, speed01: number): void {
  const p = rig.parts;
  const amp = 0.55 + speed01 * 0.35;
  const f = t * (4.5 + speed01 * 5);
  p.legL.rotation.x = Math.sin(f) * amp;
  p.legR.rotation.x = -Math.sin(f) * amp;
  p.armL.rotation.x = (p.armL.rotation.x > -1 ? -Math.sin(f) * amp * 0.6 : p.armL.rotation.x);
  if (rig.kind === 'grunt' || rig.kind === 'titan' || rig.kind === 'spitter') {
    p.armR.rotation.x = -Math.sin(f + Math.PI) * amp * (rig.kind === 'titan' ? 0.5 : 0.6);
  }
  if (rig.kind === 'titan') {
    p.torso.rotation.z = Math.sin(f * 0.5) * 0.08;
  }
  p.root.position.y = Math.abs(Math.sin(f)) * 0.045;
}

export function animIdle(rig: EnemyRig, t: number): void {
  const p = rig.parts;
  p.torso.rotation.z = Math.sin(t * 1.4) * 0.02;
  p.head.rotation.y = Math.sin(t * 0.7) * 0.12;
}

/** отдача/замах при атаке: k 0..1 */
export function animFireKick(rig: EnemyRig, k: number): void {
  const p = rig.parts;
  if (rig.kind === 'titan') {
    p.armR.rotation.x = -2.2 + k * 2.6;
    p.torso.rotation.x = 0.28 + (1 - k) * 0.3;
  } else if (rig.kind === 'spitter') {
    p.torso.rotation.x = 0.42 - Math.sin(k * Math.PI) * 0.5;
    p.head.rotation.x = -Math.sin(k * Math.PI) * 0.6;
  } else {
    p.torso.rotation.x = -Math.sin(k * Math.PI) * 0.12;
    p.armR.rotation.x = -1.35 - Math.sin(k * Math.PI) * 0.18;
  }
}

/** вспышка урона: emissive по материалам тела, f 0..1 */
export function rigFlash(rig: EnemyRig, f: number): void {
  for (const m of rig.bodyMats) m.emissive.setHex(f > 0 ? 0x7a1208 : 0x000000);
}

/** падение: p 0..1 */
export function animDeath(rig: EnemyRig, p: number): void {
  const e = 1 - Math.pow(1 - p, 2);
  rig.parts.root.rotation.x = -e * (Math.PI / 2) * 0.92;
  rig.parts.root.position.y = -e * 0.18;
  rig.parts.legL.rotation.x = e * 0.5;
  rig.parts.legR.rotation.x = e * 0.3;
}

/** подъём из песка при спавне: p 0..1 */
export function animSpawnRise(rig: EnemyRig, p: number): void {
  rig.parts.root.position.y = -(1 - p) * 1.4;
}

/* ---------- вьюмодель от первого лица ---------- */

export interface ViewRig {
  weapon: WeaponId;
  root: THREE.Group;
  gun: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  muzzle: THREE.Object3D;
  flash: THREE.Sprite;
  flashLight: THREE.PointLight;
  disposables: Disposable[];
}

let flashTex: THREE.Texture | null = null;

function makeFlashTexture(): THREE.Texture {
  if (flashTex) return flashTex;
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 64;
  const g = cv.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,240,190,1)');
    grad.addColorStop(0.35, 'rgba(255,170,70,0.75)');
    grad.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(cv);
  flashTex = t;
  return t;
}

export function disposeViewRig(v: ViewRig): void {
  v.root.removeFromParent();
  for (const d of v.disposables) d.dispose();
  v.disposables.length = 0;
}

/** модель смотрит на −Z (как камера); корень крепится к камере справа-снизу */
export function buildViewRig(weapon: WeaponId): ViewRig {
  const disposables: Disposable[] = [];
  const mk = (color: number, emissive = 0x000000): THREE.MeshLambertMaterial => {
    const m = lam(color, emissive);
    disposables.push(m);
    return m;
  };
  const metal = mk(0x36322c);
  const dark = mk(0x232019);
  const tan = mk(0xb09a6a);
  const wood = mk(0x7a5a36);
  const sleeve = mk(0x8a7a58);
  const glove = mk(0x3a332a);

  const root = new THREE.Group();
  const gun = new THREE.Group();
  root.add(gun);

  const muzzle = new THREE.Object3D();
  gun.add(muzzle);

  const armR = new THREE.Group();
  armR.position.set(0.09, -0.16, 0.18);
  armR.rotation.x = -0.5;
  root.add(armR);
  box(armR, 0.065, 0.07, 0.3, 0, -0.01, 0.1, sleeve);
  box(armR, 0.06, 0.065, 0.09, 0, -0.01, -0.08, glove);

  const armL = new THREE.Group();
  root.add(armL);

  switch (weapon) {
    case 'pistol':
      box(gun, 0.05, 0.075, 0.24, 0, 0, -0.06, dark); // затвор
      box(gun, 0.045, 0.11, 0.06, 0, -0.08, 0.05, tan); // рукоять
      muzzle.position.set(0, 0.01, -0.2);
      armL.position.set(-0.07, -0.2, 0.24);
      armL.rotation.set(-0.75, 0.2, 0.3);
      box(armL, 0.06, 0.065, 0.26, 0, 0, 0.08, sleeve);
      break;
    case 'smg':
      box(gun, 0.07, 0.1, 0.34, 0, 0, -0.08, dark);
      cyl(gun, 0.02, 0.14, 0, 0.015, -0.3, metal).rotation.x = Math.PI / 2;
      box(gun, 0.045, 0.14, 0.07, 0, -0.11, -0.02, metal); // магазин
      box(gun, 0.05, 0.07, 0.1, 0, -0.02, 0.12, tan); // приклад
      muzzle.position.set(0, 0.015, -0.38);
      armL.position.set(-0.08, -0.22, 0.2);
      armL.rotation.set(-0.8, 0.15, 0.35);
      box(armL, 0.06, 0.065, 0.28, 0, 0, 0.09, sleeve);
      break;
    case 'rifle':
      box(gun, 0.07, 0.1, 0.44, 0, 0, -0.1, dark);
      cyl(gun, 0.022, 0.3, 0, 0.02, -0.44, metal).rotation.x = Math.PI / 2;
      box(gun, 0.06, 0.09, 0.2, 0, 0, -0.34, tan); // цевьё
      box(gun, 0.05, 0.17, 0.08, 0, -0.13, -0.04, metal); // магазин
      box(gun, 0.055, 0.08, 0.14, 0, -0.01, 0.17, tan); // приклад
      muzzle.position.set(0, 0.02, -0.6);
      armL.position.set(-0.06, -0.24, 0.28);
      armL.rotation.set(-0.85, 0.1, 0.3);
      box(armL, 0.06, 0.065, 0.3, 0, 0, 0.1, sleeve);
      box(armL, 0.055, 0.06, 0.08, 0, 0, -0.09, glove);
      break;
    case 'shotgun':
      cyl(gun, 0.03, 0.4, 0.028, 0.02, -0.26, metal).rotation.x = Math.PI / 2;
      cyl(gun, 0.03, 0.4, -0.028, 0.02, -0.26, metal).rotation.x = Math.PI / 2;
      box(gun, 0.08, 0.07, 0.2, 0, -0.02, 0.02, wood);
      box(gun, 0.07, 0.06, 0.14, 0, -0.05, -0.24, wood); // помпа
      box(gun, 0.06, 0.09, 0.12, 0, -0.04, 0.16, wood); // приклад
      muzzle.position.set(0, 0.02, -0.48);
      armL.position.set(-0.07, -0.26, 0.26);
      armL.rotation.set(-0.9, 0.12, 0.3);
      box(armL, 0.06, 0.065, 0.3, 0, 0, 0.1, sleeve);
      break;
    case 'sniper':
      box(gun, 0.065, 0.09, 0.5, 0, 0, -0.12, dark);
      cyl(gun, 0.02, 0.42, 0, 0.02, -0.52, metal).rotation.x = Math.PI / 2;
      cyl(gun, 0.032, 0.24, 0, 0.1, -0.14, dark).rotation.x = Math.PI / 2; // оптика
      box(gun, 0.05, 0.16, 0.07, 0, -0.12, -0.02, metal);
      box(gun, 0.055, 0.08, 0.16, 0, -0.01, 0.2, wood);
      muzzle.position.set(0, 0.02, -0.74);
      armL.position.set(-0.06, -0.24, 0.3);
      armL.rotation.set(-0.85, 0.1, 0.3);
      box(armL, 0.06, 0.065, 0.32, 0, 0, 0.1, sleeve);
      break;
  }

  const flashMat = new THREE.SpriteMaterial({
    map: makeFlashTexture(),
    blending: THREE.AdditiveBlending,
    depthTest: false,
    transparent: true,
  });
  disposables.push(flashMat);
  const flash = new THREE.Sprite(flashMat);
  flash.scale.setScalar(0.28);
  flash.position.copy(muzzle.position);
  flash.visible = false;
  gun.add(flash);

  const flashLight = new THREE.PointLight(0xffb45e, 0, 7, 2);
  flashLight.position.copy(muzzle.position);
  gun.add(flashLight);

  return { weapon, root, gun, armL, armR, muzzle, flash, flashLight, disposables };
}

import * as THREE from 'three';

/**
 * Procedural humanoid rigs — no external models, all animation in code.
 * Character faces local +Z. Pivots: shoulders/elbows/hips/knees are Groups so
 * limbs swing from joints. Materials are cloned per rig for per-unit hit flash.
 */

export interface HumanoidRig {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  headMesh: THREE.Mesh;
  armL: THREE.Group;
  foreL: THREE.Group;
  armR: THREE.Group;
  foreR: THREE.Group;
  legL: THREE.Group;
  shinL: THREE.Group;
  legR: THREE.Group;
  shinR: THREE.Group;
  gun: THREE.Group | null;
  muzzle: THREE.Object3D | null;
  blobShadow: THREE.Mesh;
  flashMaterials: THREE.MeshLambertMaterial[];
  /** per-rig GPU resources to free on removal (shared boxes/textures excluded) */
  disposables: { dispose(): void }[];
  /** base hip height used by animations */
  hipY: number;
  scale: number;
}

export interface RigOpts {
  skin: number;
  clothes: number;
  eye: number;
  scale: number;
  zombie: boolean;
  shadowTexture: THREE.Texture;
  withGun?: boolean;
}

interface RigGeometry {
  pelvis: THREE.BoxGeometry;
  torso: THREE.BoxGeometry;
  head: THREE.BoxGeometry;
  limb: THREE.BoxGeometry;
  fore: THREE.BoxGeometry;
  thigh: THREE.BoxGeometry;
  shin: THREE.BoxGeometry;
  gunBody: THREE.BoxGeometry;
  gunBarrel: THREE.BoxGeometry;
}

let sharedGeo: RigGeometry | null = null;

/** Free per-rig GPU resources (shared boxes & textures are kept). */
export function disposeRig(rig: HumanoidRig): void {
  for (const d of rig.disposables) d.dispose();
  rig.disposables.length = 0;
}

function geo(): RigGeometry {
  sharedGeo ??= {
    pelvis: new THREE.BoxGeometry(0.42, 0.22, 0.26),
    torso: new THREE.BoxGeometry(0.52, 0.62, 0.3),
    head: new THREE.BoxGeometry(0.32, 0.34, 0.32),
    limb: new THREE.BoxGeometry(0.14, 0.4, 0.14),
    fore: new THREE.BoxGeometry(0.12, 0.36, 0.12),
    thigh: new THREE.BoxGeometry(0.17, 0.46, 0.17),
    shin: new THREE.BoxGeometry(0.14, 0.44, 0.14),
    gunBody: new THREE.BoxGeometry(0.09, 0.14, 0.66),
    gunBarrel: new THREE.BoxGeometry(0.05, 0.05, 0.36),
  };
  return sharedGeo;
}

function limb(parent: THREE.Group, m: THREE.MeshLambertMaterial, g: THREE.BoxGeometry, lengthDown: number, s: number): void {
  const joint = new THREE.Group();
  const mesh = new THREE.Mesh(g, m);
  mesh.position.y = -lengthDown / 2;
  mesh.scale.setScalar(s);
  joint.add(mesh);
  parent.add(joint);
}

export function buildHumanoid(opts: RigOpts): HumanoidRig {
  const G = geo();
  const s = opts.scale;

  const skinMat = new THREE.MeshLambertMaterial({ color: opts.skin });
  const clothMat = new THREE.MeshLambertMaterial({ color: opts.clothes });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1b1e24 });
  const flashMaterials = [skinMat, clothMat, darkMat];

  const root = new THREE.Group();
  const hipY = 0.95 * s;

  const body = new THREE.Group();
  body.position.y = hipY;
  root.add(body);

  const pelvis = new THREE.Mesh(G.pelvis, clothMat);
  pelvis.position.y = 0.02 * s;
  pelvis.scale.setScalar(s);
  body.add(pelvis);

  const torso = new THREE.Mesh(G.torso, clothMat);
  torso.position.y = 0.42 * s;
  torso.scale.setScalar(s);
  body.add(torso);

  const head = new THREE.Group();
  head.position.y = 0.78 * s;
  body.add(head);
  const headMesh = new THREE.Mesh(G.head, skinMat);
  headMesh.position.y = 0.16 * s;
  headMesh.scale.setScalar(s);
  head.add(headMesh);

  const eyeMat = new THREE.MeshBasicMaterial({ color: opts.eye });
  const eyeGeo = new THREE.SphereGeometry(0.035 * s, 6, 6);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(side * 0.08 * s, 0.18 * s, 0.16 * s);
    head.add(eye);
  }
  if (opts.zombie) {
    // torn jaw hint
    const jaw = new THREE.Mesh(G.fore, darkMat);
    jaw.scale.set(0.9 * s, 0.35 * s, 0.9 * s);
    jaw.position.set(0, 0.02 * s, 0.1 * s);
    head.add(jaw);
  }

  // arms (pivot at shoulder; fore arms pivot at elbow)
  const armL = new THREE.Group();
  armL.position.set(-0.34 * s, 0.62 * s, 0);
  body.add(armL);
  limb(armL, skinMat, G.limb, 0.4 * s, s);
  const foreL = new THREE.Group();
  foreL.position.y = -0.4 * s;
  armL.add(foreL);
  limb(foreL, skinMat, G.fore, 0.36 * s, s);

  const armR = new THREE.Group();
  armR.position.set(0.34 * s, 0.62 * s, 0);
  body.add(armR);
  limb(armR, skinMat, G.limb, 0.4 * s, s);
  const foreR = new THREE.Group();
  foreR.position.y = -0.4 * s;
  armR.add(foreR);
  limb(foreR, skinMat, G.fore, 0.36 * s, s);

  // legs
  const legL = new THREE.Group();
  legL.position.set(-0.14 * s, -0.06 * s, 0);
  body.add(legL);
  limb(legL, darkMat, G.thigh, 0.46 * s, s);
  const shinL = new THREE.Group();
  shinL.position.y = -0.46 * s;
  legL.add(shinL);
  limb(shinL, darkMat, G.shin, 0.44 * s, s);

  const legR = new THREE.Group();
  legR.position.set(0.14 * s, -0.06 * s, 0);
  body.add(legR);
  limb(legR, darkMat, G.thigh, 0.46 * s, s);
  const shinR = new THREE.Group();
  shinR.position.y = -0.46 * s;
  legR.add(shinR);
  limb(shinR, darkMat, G.shin, 0.44 * s, s);

  if (opts.zombie) {
    // base pose: arms stretched forward, head lolling
    armL.rotation.x = -1.45;
    armR.rotation.x = -1.45;
    foreL.rotation.x = -0.25;
    foreR.rotation.x = -0.25;
    head.rotation.x = 0.22;
    body.rotation.x = 0.12;
  }

  let gun: THREE.Group | null = null;
  let muzzle: THREE.Object3D | null = null;
  if (opts.withGun) {
    gun = new THREE.Group();
    const gunBody = new THREE.Mesh(G.gunBody, darkMat);
    gun.add(gunBody);
    const barrel = new THREE.Mesh(G.gunBarrel, darkMat);
    barrel.position.z = 0.44;
    barrel.position.y = 0.03;
    gun.add(barrel);
    muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.03, 0.66);
    gun.add(muzzle);
    // held in front: attach to body, positioned at hands
    gun.position.set(0.12 * s, 0.52 * s, 0.42 * s);
    gun.rotation.x = -0.08;
    body.add(gun);
    // arms reach the gun
    armR.rotation.x = -1.25;
    armL.rotation.x = -1.15;
    foreR.rotation.x = -0.5;
    foreL.rotation.x = -0.55;
  }

  const shadowGeo = new THREE.PlaneGeometry(1.15 * s, 1.15 * s);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: opts.shadowTexture, transparent: true, opacity: 0.55,
    depthWrite: false, color: 0x000000,
  });
  const blobShadow = new THREE.Mesh(shadowGeo, shadowMat);
  blobShadow.rotation.x = -Math.PI / 2;
  blobShadow.position.y = 0.015;
  root.add(blobShadow);

  const disposables: { dispose(): void }[] = [
    skinMat, clothMat, darkMat, eyeMat, eyeGeo, shadowGeo, shadowMat,
  ];

  return {
    root, body, head, headMesh,
    armL, foreL, armR, foreR, legL, shinL, legR, shinR,
    gun, muzzle, blobShadow, flashMaterials, disposables, hipY, scale: s,
  };
}

/* ------------------------------ animations ------------------------------ */

/** Walk/run cycle. t is phase in radians; intensity 0..1 scales the stride. */
export function animateWalk(rig: HumanoidRig, t: number, intensity: number, zombie: boolean): void {
  const s = Math.sin(t);
  const c = Math.cos(t);
  const k = Math.max(0.15, intensity);
  rig.legL.rotation.x = s * 0.62 * k;
  rig.legR.rotation.x = -s * 0.62 * k;
  rig.shinL.rotation.x = Math.max(0, -c) * 0.85 * k;
  rig.shinR.rotation.x = Math.max(0, c) * 0.85 * k;
  if (zombie) {
    rig.armL.rotation.x = -1.45 + s * 0.14 * k;
    rig.armR.rotation.x = -1.45 - s * 0.14 * k;
    rig.body.position.y = rig.hipY + Math.abs(s) * 0.045 * k;
    rig.body.rotation.z = Math.sin(t * 0.5) * 0.07;
    rig.body.rotation.x = 0.12 + k * 0.06;
    rig.head.rotation.z = Math.sin(t * 0.37 + 1) * 0.12;
  } else {
    rig.armL.rotation.x = -1.15 - s * 0.12 * k;
    rig.armR.rotation.x = -1.25 + s * 0.12 * k;
    rig.body.position.y = rig.hipY + Math.abs(s) * 0.05 * k;
    rig.body.rotation.z = -s * 0.04 * k;
    rig.body.rotation.x = 0.04 + k * 0.1;
  }
}

export function animateIdle(rig: HumanoidRig, time: number, zombie: boolean): void {
  const b = Math.sin(time * 2.1) * 0.02;
  rig.body.position.y = rig.hipY + b;
  if (zombie) {
    rig.body.rotation.z = Math.sin(time * 0.8) * 0.05;
    rig.armL.rotation.x = -1.45 + Math.sin(time * 1.3) * 0.06;
    rig.armR.rotation.x = -1.45 + Math.sin(time * 1.1 + 2) * 0.06;
    rig.head.rotation.z = Math.sin(time * 0.6) * 0.1;
  } else {
    rig.body.rotation.x = 0.02 + b * 0.4;
  }
}

/** Attack lunge. p 0..1: windup → swipe → recover. */
export function animateAttack(rig: HumanoidRig, p: number, zombie: boolean): void {
  const swing = Math.sin(Math.min(1, p) * Math.PI);
  if (zombie) {
    rig.armL.rotation.x = -1.45 - swing * 0.9;
    rig.armR.rotation.x = -1.45 - swing * 0.9;
    rig.foreL.rotation.x = -0.25 - swing * 0.5;
    rig.foreR.rotation.x = -0.25 - swing * 0.5;
    rig.body.rotation.x = 0.12 + swing * 0.34;
    rig.head.rotation.x = 0.22 - swing * 0.3;
  } else {
    rig.body.rotation.x = swing * 0.12;
  }
}

/** Death: topple, sprawl, sink. p 0..1. fallSign +1 = backward. */
export function animateDeath(rig: HumanoidRig, p: number, fallSign: number): void {
  const fall = Math.min(1, p / 0.38);
  const eased = 1 - (1 - fall) * (1 - fall);
  rig.root.rotation.x = -fallSign * eased * (Math.PI / 2) * 0.92;
  // limbs go limp
  rig.armL.rotation.x = THREE.MathUtils.lerp(rig.armL.rotation.x, 0.5, p * 0.2);
  rig.armR.rotation.x = THREE.MathUtils.lerp(rig.armR.rotation.x, 0.4, p * 0.2);
  rig.armL.rotation.z = THREE.MathUtils.lerp(0, 0.5, eased);
  rig.armR.rotation.z = THREE.MathUtils.lerp(0, -0.4, eased);
  rig.legL.rotation.x = THREE.MathUtils.lerp(rig.legL.rotation.x, 0.15, p * 0.25);
  rig.legR.rotation.x = THREE.MathUtils.lerp(rig.legR.rotation.x, -0.2, p * 0.25);
  rig.shinL.rotation.x = THREE.MathUtils.lerp(rig.shinL.rotation.x, 0.3, p * 0.25);
  rig.body.rotation.z = THREE.MathUtils.lerp(rig.body.rotation.z, 0.18 * fallSign, p * 0.2);
  rig.head.rotation.x = THREE.MathUtils.lerp(rig.head.rotation.x, -0.35, p * 0.3);
  // sink + fade in the second half
  if (p > 0.55) {
    const sink = (p - 0.55) / 0.45;
    rig.root.position.y = -sink * 0.55;
    const opacity = 1 - sink;
    for (const m of rig.flashMaterials) {
      m.transparent = true;
      m.opacity = opacity;
    }
    const shadowMat = rig.blobShadow.material as THREE.MeshBasicMaterial;
    shadowMat.opacity = 0.55 * opacity;
    rig.blobShadow.scale.setScalar(1 - sink * 0.4);
  }
}

/** Weapon recoil kick. k 0..1 (1 = just fired). */
export function animateRecoil(rig: HumanoidRig, k: number): void {
  if (!rig.gun) return;
  rig.gun.position.z = 0.42 * rig.scale - k * 0.09;
  rig.gun.rotation.x = -0.08 + k * 0.16;
  rig.armR.rotation.x = -1.25 + k * 0.14;
  rig.body.rotation.x = Math.max(rig.body.rotation.x, 0.04) - k * 0.03;
}

/** Reload: gun dips down-left. p 0..1. */
export function animateReload(rig: HumanoidRig, p: number): void {
  if (!rig.gun) return;
  const dip = Math.sin(Math.min(1, p) * Math.PI);
  rig.gun.rotation.x = -0.08 - dip * 0.75;
  rig.gun.rotation.z = dip * 0.35;
  rig.gun.position.y = 0.52 * rig.scale - dip * 0.14;
  rig.armL.rotation.x = -1.15 - dip * 0.45;
  rig.head.rotation.x = dip * 0.25;
}

export function setHitFlash(rig: HumanoidRig, on: boolean): void {
  for (const m of rig.flashMaterials) {
    m.emissive.setHex(on ? 0x8a1010 : 0x000000);
  }
}

/** World-space head/chest anchors for hit tests. */
export function headPoint(rig: HumanoidRig, out: THREE.Vector3): THREE.Vector3 {
  rig.headMesh.getWorldPosition(out);
  return out;
}

export function chestPoint(rig: HumanoidRig, out: THREE.Vector3): THREE.Vector3 {
  rig.body.getWorldPosition(out);
  out.y += 0.42 * rig.scale;
  return out;
}

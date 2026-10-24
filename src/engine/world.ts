import * as THREE from 'three';
import { ARENA } from '../game/types';
import { createRng } from '../game/rng';

/**
 * Arena: flooded asphalt courtyard of an abandoned complex. Canvas textures
 * only (zero downloads), prop colliders are circles, blob shadows shared.
 */

export interface PropCollider {
  x: number;
  z: number;
  r: number;
}

export interface World {
  spawnPoints: THREE.Vector3[];
  colliders: PropCollider[];
  blobShadowTexture: THREE.Texture;
  /** call each frame with elapsed time — flickering lamps */
  update: (t: number) => void;
  dispose: () => void;
}

function floorTexture(): THREE.Texture {
  const size = 512;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const g = cv.getContext('2d');
  if (g) {
    g.fillStyle = '#151a22';
    g.fillRect(0, 0, size, size);
    // asphalt speckle
    for (let i = 0; i < 2600; i++) {
      const v = 18 + Math.random() * 26;
      g.fillStyle = `rgba(${v + 6},${v + 8},${v + 14},0.5)`;
      g.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }
    // concrete slabs
    g.strokeStyle = 'rgba(8,10,14,0.85)';
    g.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      const p = (i * size) / 4;
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, size); g.stroke();
      g.beginPath(); g.moveTo(0, p); g.lineTo(size, p); g.stroke();
    }
    // cracks
    g.strokeStyle = 'rgba(6,8,11,0.6)';
    g.lineWidth = 1.4;
    for (let i = 0; i < 10; i++) {
      g.beginPath();
      let x = Math.random() * size;
      let y = Math.random() * size;
      g.moveTo(x, y);
      for (let s = 0; s < 6; s++) {
        x += (Math.random() - 0.5) * 70;
        y += (Math.random() - 0.5) * 70;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    // old blood stains
    for (let i = 0; i < 7; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 12 + Math.random() * 30;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(58,10,14,0.5)');
      grad.addColorStop(1, 'rgba(58,10,14,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(7, 7);
  return tex;
}

function blobShadowCanvas(): THREE.Texture {
  const size = 64;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const g = cv.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(0,0,0,0.85)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.35)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function breachTexture(): THREE.Texture {
  const size = 128;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const g = cv.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(225,29,72,0.9)');
    grad.addColorStop(0.5, 'rgba(150,20,50,0.35)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildWorld(scene: THREE.Scene): World {
  const rng = createRng(20261024);
  const disposables: { dispose: () => void }[] = [];
  const colliders: PropCollider[] = [];

  const floorTex = floorTexture();
  const shadowTex = blobShadowCanvas();
  const breachTex = breachTexture();
  disposables.push(floorTex, shadowTex, breachTex);

  // fog + background: night
  scene.background = new THREE.Color(0x0a0e14);
  scene.fog = new THREE.FogExp2(0x0a0e14, 0.027);

  // floor
  const floorMat = new THREE.MeshLambertMaterial({ map: floorTex });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA.half * 2 + 6, ARENA.half * 2 + 6), floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  disposables.push(floor.geometry, floorMat);

  // perimeter walls with hazard stripes
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x2a303a });
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0x7a1226 });
  const H = ARENA.wallHeight;
  for (let i = 0; i < 4; i++) {
    const horizontal = i % 2 === 0;
    const len = ARENA.half * 2 + 6;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? len : 1, H, horizontal ? 1 : len), wallMat);
    const off = ARENA.half + 3;
    wall.position.set(
      horizontal ? 0 : (i === 1 ? off : -off),
      H / 2,
      horizontal ? (i === 0 ? -off : off) : 0,
    );
    scene.add(wall);
    disposables.push(wall.geometry);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? len : 1.06, 0.22, horizontal ? 1.06 : len), stripeMat);
    stripe.position.copy(wall.position);
    stripe.position.y = H - 0.5;
    scene.add(stripe);
    disposables.push(stripe.geometry);
  }
  disposables.push(wallMat, stripeMat);

  // lights: cold moon + warm flickering yard lamps
  const hemi = new THREE.HemisphereLight(0x2c3a52, 0x0b0d12, 0.55);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x9db4dd, 1.15);
  moon.position.set(-18, 30, 12);
  scene.add(moon);

  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x20242c });
  const lamps: { light: THREE.PointLight; base: number; seed: number; broken: boolean }[] = [];
  const lampPos: [number, number][] = [[-16, -16], [16, -16], [-16, 16], [16, 16]];
  for (let i = 0; i < lampPos.length; i++) {
    const [lx, lz] = lampPos[i] ?? [0, 0];
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.4, 6), poleMat);
    pole.position.set(lx, 2.7, lz);
    scene.add(pole);
    disposables.push(pole.geometry);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), lampMat);
    bulb.position.set(lx, 5.3, lz);
    scene.add(bulb);
    disposables.push(bulb.geometry);
    const light = new THREE.PointLight(0xffb96b, 14, 20, 2);
    light.position.set(lx, 5.1, lz);
    scene.add(light);
    lamps.push({ light, base: 14, seed: i * 7.3, broken: i === 2 });
    colliders.push({ x: lx, z: lz, r: 0.4 });
  }
  disposables.push(lampMat, poleMat);

  // props: crates, toxic barrels, broken pillars (seeded layout)
  const crateMat = new THREE.MeshLambertMaterial({ color: 0x6b5230 });
  const barrelMat = new THREE.MeshLambertMaterial({ color: 0x3f5d2a });
  const barrelGlow = new THREE.MeshBasicMaterial({ color: 0x9ae63c });
  const concreteMat = new THREE.MeshLambertMaterial({ color: 0x3a4048 });
  const crateGeo = new THREE.BoxGeometry(1, 1, 1);
  const barrelGeo = new THREE.CylinderGeometry(0.36, 0.36, 1.05, 10);
  const pillarGeo = new THREE.CylinderGeometry(0.5, 0.6, 3.1, 8);

  for (let i = 0; i < 26; i++) {
    let x = 0;
    let z = 0;
    // keep the middle breathable
    for (let tries = 0; tries < 12; tries++) {
      x = (rng() * 2 - 1) * (ARENA.half - 2.5);
      z = (rng() * 2 - 1) * (ARENA.half - 2.5);
      if (Math.hypot(x, z) > 6) break;
    }
    const kind = rng();
    if (kind < 0.45) {
      const stack = 1 + Math.floor(rng() * 2.4);
      for (let s = 0; s < stack; s++) {
        const crate = new THREE.Mesh(crateGeo, crateMat);
        const sc = 0.85 + rng() * 0.4;
        crate.scale.set(sc, sc, sc);
        crate.position.set(x + (rng() - 0.5) * 0.25, sc / 2 + s * 0.88, z + (rng() - 0.5) * 0.25);
        crate.rotation.y = rng() * 0.8;
        scene.add(crate);
      }
      colliders.push({ x, z, r: 0.85 * stack * 0.7 });
    } else if (kind < 0.8) {
      const barrel = new THREE.Mesh(barrelGeo, barrelMat);
      barrel.position.set(x, 0.52, z);
      scene.add(barrel);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.03, 6, 14), barrelGlow);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, 0.78, z);
      scene.add(ring);
      disposables.push(ring.geometry);
      colliders.push({ x, z, r: 0.55 });
    } else {
      const pillar = new THREE.Mesh(pillarGeo, concreteMat);
      pillar.position.set(x, 1.55, z);
      pillar.rotation.z = (rng() - 0.5) * 0.18;
      scene.add(pillar);
      colliders.push({ x, z, r: 0.75 });
    }
  }
  disposables.push(crateGeo, barrelGeo, pillarGeo, crateMat, barrelMat, barrelGlow, concreteMat);

  // spawn breaches: glowing rifts at the walls
  const breachMat = new THREE.MeshBasicMaterial({ map: breachTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  disposables.push(breachMat);
  const spawnPoints: THREE.Vector3[] = [];
  const breachGeo = new THREE.PlaneGeometry(3.4, 3.4);
  disposables.push(breachGeo);
  const gateAngles = [0, Math.PI / 2, Math.PI, -Math.PI / 2, Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4, -Math.PI / 4];
  for (const a of gateAngles) {
    const gx = Math.sin(a) * (ARENA.half + 2.2);
    const gz = Math.cos(a) * (ARENA.half + 2.2);
    const decal = new THREE.Mesh(breachGeo, breachMat);
    decal.position.set(gx, 1.7, gz);
    decal.lookAt(0, 1.7, 0);
    scene.add(decal);
    spawnPoints.push(new THREE.Vector3(Math.sin(a) * (ARENA.half - 1.2), 0, Math.cos(a) * (ARENA.half - 1.2)));
  }

  const update = (t: number): void => {
    for (const lamp of lamps) {
      if (lamp.broken) {
        // broken lamp: mostly dark, occasional stutter
        const flick = Math.sin(t * 23 + lamp.seed) > 0.92 || Math.sin(t * 7.3 + lamp.seed) > 0.985;
        lamp.light.intensity = flick ? lamp.base * (0.4 + Math.random() * 0.5) : 1.2;
      } else {
        lamp.light.intensity = lamp.base * (0.88 + Math.sin(t * 9 + lamp.seed) * 0.06 + Math.sin(t * 31 + lamp.seed * 2) * 0.04);
      }
    }
  };

  const dispose = (): void => {
    for (const d of disposables) d.dispose();
  };

  return { spawnPoints, colliders, blobShadowTexture: shadowTex, update, dispose };
}

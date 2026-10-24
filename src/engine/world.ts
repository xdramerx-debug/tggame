import * as THREE from 'three';
import { BASE_POS, CRATE_SPOTS, GATE_W, MAP_BOXES, MAP_CYLS, OBSTACLES, SPAWN_GATES, type BoxObstacle, type MatKey } from '../game/map';
import { ARENA } from '../game/types';
import { buildCollider, type Collider } from './collide';

/**
 * Сцена «Рубеж-9»: золотой песок, саманные стены, длинное солнце,
 * дымка хамсина, база с радиомачтой и ящики-лутомки. Всё процедурное.
 */

type Disposable = THREE.BufferGeometry | THREE.Material | THREE.Texture;

/** декор/коллидеры лагеря базы (юг) */
const CAMP_BOXES: BoxObstacle[] = [
  { kind: 'box', x: 0, z: 37.6, hw: 1.7, hd: 0.75, h: 1.05, mat: 'crate' }, // верстак
  { kind: 'box', x: 8.5, z: 36, hw: 2.6, hd: 2, h: 2.8, mat: 'adobe' }, // палатка
  { kind: 'box', x: -7, z: 36.4, hw: 1.4, hd: 1.2, h: 1.6, mat: 'crate' }, // ящики у склада
  { kind: 'box', x: -7, z: 36.4, hw: 1, hd: 0.9, h: 2.6, mat: 'crate' },
];

function canvasTexture(
  size: number,
  draw: (g: CanvasRenderingContext2D, s: number) => void,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const g = cv.getContext('2d');
  if (g) draw(g, size);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function speckle(g: CanvasRenderingContext2D, s: number, n: number, colors: string[]): void {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[i % colors.length] ?? '#ffffff';
    g.globalAlpha = 0.16 + Math.random() * 0.3;
    g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  g.globalAlpha = 1;
}

function makeSandTexture(): THREE.CanvasTexture {
  return canvasTexture(512, (g, s) => {
    g.fillStyle = '#d8c191';
    g.fillRect(0, 0, s, s);
    // рябь от ветра
    g.strokeStyle = 'rgba(190,165,115,0.5)';
    g.lineWidth = 2;
    for (let i = 0; i < 34; i++) {
      const y = Math.random() * s;
      const amp = 4 + Math.random() * 8;
      g.beginPath();
      for (let x = 0; x <= s; x += 16) {
        g.lineTo(x, y + Math.sin(x * 0.05 + i) * amp);
      }
      g.stroke();
    }
    speckle(g, s, 2400, ['#e8d8ac', '#b99f6e', '#c9b183']);
    // камешки
    for (let i = 0; i < 70; i++) {
      g.fillStyle = 'rgba(120,105,80,0.5)';
      g.beginPath();
      g.ellipse(Math.random() * s, Math.random() * s, 1.5 + Math.random() * 3, 1 + Math.random() * 2, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }, 14, 14);
}

function makeAdobeTexture(): THREE.CanvasTexture {
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#c4a268';
    g.fillRect(0, 0, s, s);
    const rows = 6;
    const rh = s / rows;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 === 0 ? 0 : s / 6;
      g.strokeStyle = 'rgba(90,68,40,0.65)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(0, r * rh);
      g.lineTo(s, r * rh);
      g.stroke();
      for (let c = -1; c < 4; c++) {
        const x = off + c * (s / 3);
        g.beginPath();
        g.moveTo(x, r * rh);
        g.lineTo(x, (r + 1) * rh);
        g.stroke();
      }
    }
    // потёки и выветривание
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = 'rgba(105,82,50,0.18)';
      g.lineWidth = 2 + Math.random() * 5;
      const x = Math.random() * s;
      g.beginPath();
      g.moveTo(x, Math.random() * s * 0.4);
      g.lineTo(x + (Math.random() - 0.5) * 12, s);
      g.stroke();
    }
    speckle(g, s, 700, ['#d8bb85', '#a8864f']);
  });
}

function makeWoodTexture(): THREE.CanvasTexture {
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#a5813f';
    g.fillRect(0, 0, s, s);
    const planks = 5;
    const pw = s / planks;
    for (let i = 0; i < planks; i++) {
      g.fillStyle = i % 2 === 0 ? '#a5813f' : '#98753a';
      g.fillRect(i * pw, 0, pw, s);
      g.strokeStyle = 'rgba(60,42,18,0.8)';
      g.lineWidth = 3;
      g.strokeRect(i * pw, 0, pw, s);
      // волокна
      g.strokeStyle = 'rgba(70,50,22,0.35)';
      g.lineWidth = 1;
      for (let k = 0; k < 7; k++) {
        const x = i * pw + 4 + Math.random() * (pw - 8);
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x + (Math.random() - 0.5) * 6, s);
        g.stroke();
      }
    }
    // гвозди по углам
    g.fillStyle = 'rgba(40,32,22,0.9)';
    for (let i = 0; i < planks; i++) {
      for (const y of [10, s - 10]) {
        g.beginPath();
        g.arc(i * pw + pw / 2, y, 2.6, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
}

function makeMetalTexture(): THREE.CanvasTexture {
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#8a7a5e';
    g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(50,44,32,0.7)';
    g.lineWidth = 4;
    g.strokeRect(10, 10, s - 20, s - 20);
    g.beginPath();
    g.moveTo(10, s / 2);
    g.lineTo(s - 10, s / 2);
    g.stroke();
    // заклёпки
    g.fillStyle = 'rgba(60,52,38,0.85)';
    for (let i = 0; i < 8; i++) {
      g.beginPath();
      g.arc(22 + i * (s - 44) / 7, 22, 3, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(22 + i * (s - 44) / 7, s - 22, 3, 0, Math.PI * 2);
      g.fill();
    }
    // ржавчина
    for (let i = 0; i < 22; i++) {
      g.fillStyle = 'rgba(140,84,40,0.28)';
      g.beginPath();
      g.ellipse(Math.random() * s, Math.random() * s, 4 + Math.random() * 16, 3 + Math.random() * 10, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
    speckle(g, s, 400, ['#6e624a', '#9a8a6c']);
  });
}

function makeSandbagTexture(): THREE.CanvasTexture {
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#b09a68';
    g.fillRect(0, 0, s, s);
    const rows = 5;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 === 0 ? 0 : s / 8;
      for (let c = -1; c < 5; c++) {
        const x = off + c * (s / 4);
        const y = r * (s / rows) + 4;
        g.fillStyle = r % 2 === 0 ? '#c8b080' : '#bda474';
        g.beginPath();
        g.roundRect(x + 4, y, s / 4 - 8, s / rows - 8, 12);
        g.fill();
        g.strokeStyle = 'rgba(80,64,36,0.5)';
        g.lineWidth = 2;
        g.stroke();
      }
    }
    speckle(g, s, 500, ['#8a7448', '#d8c498']);
  });
}

function makeStoneTexture(): THREE.CanvasTexture {
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#9a9188';
    g.fillRect(0, 0, s, s);
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 === 0 ? 0 : s / 6;
      g.strokeStyle = 'rgba(56,52,46,0.75)';
      g.lineWidth = 4;
      for (let c = -1; c < 4; c++) {
        g.strokeRect(off + c * (s / 3) + 3, r * (s / rows) + 3, s / 3 - 6, s / rows - 6);
      }
    }
    speckle(g, s, 800, ['#b0a79c', '#7a7168']);
  });
}

function makeSkyTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 256;
  const g = cv.getContext('2d');
  if (g) {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#274a78'); // зенит
    grad.addColorStop(0.42, '#7a96bd');
    grad.addColorStop(0.68, '#d9b980'); // тёплый пояс
    grad.addColorStop(0.86, '#ecd09a');
    grad.addColorStop(1, '#dcc9a0'); // горизонт в дымке
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 256);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeGlowTexture(inner: string, outer: string): THREE.CanvasTexture {
  return canvasTexture(128, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.4, outer);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });
}

function makeBeamTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 32;
  cv.height = 128;
  const g = cv.getContext('2d');
  if (g) {
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(255,214,120,0)');
    grad.addColorStop(0.5, 'rgba(255,214,120,0.5)');
    grad.addColorStop(1, 'rgba(255,236,170,0.85)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 128);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface LootCrateView {
  group: THREE.Group;
  dispose(): void;
}

export class World {
  readonly scene: THREE.Scene;
  readonly collider: Collider;
  readonly minimapRects: { x: number; z: number; hw: number; hd: number }[] = [];
  readonly crateSpots = CRATE_SPOTS;
  readonly spawnGates = SPAWN_GATES;
  readonly basePos = BASE_POS;
  readonly sun: THREE.DirectionalLight;

  private disposables: Disposable[] = [];
  private gateGlows: THREE.Mesh[] = [];
  private gateMat: THREE.MeshBasicMaterial;
  private mastLightMat!: THREE.SpriteMaterial;
  private dust: THREE.Points;
  private dustBase: Float32Array;
  private dustMat: THREE.PointsMaterial;
  private beamTex: THREE.Texture;
  private crateBoxMat: THREE.MeshLambertMaterial;
  private crateGlowMat: THREE.MeshBasicMaterial;
  private crateGeo: THREE.BoxGeometry;
  private beamGeo: THREE.CylinderGeometry;
  private time = 0;

  constructor() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xd9c9a3, 0.0105);
    this.collider = buildCollider([...OBSTACLES, ...CAMP_BOXES]);
    for (const b of this.collider.boxes) {
      this.minimapRects.push({ x: b.x, z: b.z, hw: b.hw, hd: b.hd });
    }

    const H = ARENA.half;

    // небо
    const skyTex = makeSkyTexture();
    const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false });
    const skyGeo = new THREE.SphereGeometry(210, 24, 16);
    const sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(sky);
    this.disposables.push(skyTex, skyMat, skyGeo);

    // солнце-спрайт
    const sunTex = makeGlowTexture('rgba(255,250,230,1)', 'rgba(255,200,110,0.5)');
    const sunMat = new THREE.SpriteMaterial({ map: sunTex, blending: THREE.AdditiveBlending, fog: false, depthWrite: false });
    const sunSprite = new THREE.Sprite(sunMat);
    sunSprite.scale.setScalar(46);
    sunSprite.position.set(120, 78, -140);
    this.scene.add(sunSprite);
    this.disposables.push(sunTex, sunMat);

    // свет
    const hemi = new THREE.HemisphereLight(0xc6d8f2, 0xc9a06a, 0.95);
    this.scene.add(hemi);
    const amb = new THREE.AmbientLight(0x514636, 0.55);
    this.scene.add(amb);
    this.sun = new THREE.DirectionalLight(0xffd9a0, 2.3);
    this.sun.position.set(48, 40, -56);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -46;
    sc.right = 46;
    sc.top = 46;
    sc.bottom = -46;
    sc.near = 5;
    sc.far = 180;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun);

    // земля
    const sandTex = makeSandTexture();
    const sandMat = new THREE.MeshLambertMaterial({ map: sandTex });
    const groundGeo = new THREE.PlaneGeometry(H * 2 + 40, H * 2 + 40);
    const ground = new THREE.Mesh(groundGeo, sandMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.disposables.push(sandTex, sandMat, groundGeo);

    // материалы препятствий
    const texAdobe = makeAdobeTexture();
    const texWood = makeWoodTexture();
    const texMetal = makeMetalTexture();
    const texSandbag = makeSandbagTexture();
    const texStone = makeStoneTexture();
    const mats: Record<MatKey, THREE.MeshLambertMaterial> = {
      adobe: new THREE.MeshLambertMaterial({ map: texAdobe }),
      crate: new THREE.MeshLambertMaterial({ map: texWood }),
      metal: new THREE.MeshLambertMaterial({ map: texMetal }),
      sandbag: new THREE.MeshLambertMaterial({ map: texSandbag }),
      stone: new THREE.MeshLambertMaterial({ map: texStone }),
    };
    this.disposables.push(texAdobe, texWood, texMetal, texSandbag, texStone, ...Object.values(mats));
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 14);
    this.disposables.push(boxGeo, cylGeo);

    for (const b of MAP_BOXES) {
      const mesh = new THREE.Mesh(boxGeo, mats[b.mat]);
      mesh.scale.set(b.hw * 2, b.h, b.hd * 2);
      mesh.position.set(b.x, b.h / 2, b.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
    for (const c of MAP_CYLS) {
      const mesh = new THREE.Mesh(cylGeo, mats[c.mat]);
      mesh.scale.set(c.r * 2, c.h, c.r * 2);
      mesh.position.set(c.x, c.h / 2, c.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }

    // вышки: деревянная площадка + перила на высоких боксах
    const railMat = new THREE.MeshLambertMaterial({ color: 0x8a6a3a });
    this.disposables.push(railMat);
    for (const b of MAP_BOXES) {
      if (b.h < 4.5) continue;
      const deck = new THREE.Mesh(boxGeo, mats.crate);
      deck.scale.set(b.hw * 2 + 1, 0.24, b.hd * 2 + 1);
      deck.position.set(b.x, b.h + 0.12, b.z);
      deck.castShadow = true;
      this.scene.add(deck);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        const post = new THREE.Mesh(boxGeo, railMat);
        post.scale.set(0.12, 1, 0.12);
        post.position.set(b.x + sx * (b.hw + 0.35), b.h + 0.7, b.z + sz * (b.hd + 0.35));
        this.scene.add(post);
      }
    }

    // ворота: светящиеся маркеры + арки
    this.gateMat = new THREE.MeshBasicMaterial({
      color: 0xff5a2a, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    this.disposables.push(this.gateMat);
    const glowGeo = new THREE.PlaneGeometry(GATE_W + 1.4, 2.4);
    const archGeo = new THREE.BoxGeometry(GATE_W + 2, 1.1, 1.6);
    this.disposables.push(glowGeo, archGeo);
    for (const gate of SPAWN_GATES) {
      const glow = new THREE.Mesh(glowGeo, this.gateMat);
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(gate.x, 0.04, gate.z);
      if (Math.abs(gate.x) > 30) glow.rotation.z = Math.PI / 2;
      this.scene.add(glow);
      this.gateGlows.push(glow);
      const arch = new THREE.Mesh(archGeo, mats.adobe);
      arch.position.set(gate.x, 5.4, gate.z);
      if (Math.abs(gate.x) > 30) arch.rotation.y = Math.PI / 2;
      arch.castShadow = true;
      this.scene.add(arch);
    }

    // лагерь базы
    this.buildCamp(boxGeo, cylGeo);

    // пылинки в воздухе
    const dustCount = 260;
    const dustPos = new Float32Array(dustCount * 3);
    this.dustBase = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      const x = (Math.random() - 0.5) * 92;
      const y = 0.3 + Math.random() * 7;
      const z = (Math.random() - 0.5) * 92;
      dustPos.set([x, y, z], i * 3);
      this.dustBase.set([x, y, z], i * 3);
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    this.dustMat = new THREE.PointsMaterial({
      color: 0xe8d8b0, size: 0.075, transparent: true, opacity: 0.4,
      depthWrite: false, sizeAttenuation: true,
    });
    this.dust = new THREE.Points(dustGeo, this.dustMat);
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
    this.disposables.push(dustGeo, this.dustMat);

    // ресурсы ящиков-луток
    this.beamTex = makeBeamTexture();
    this.crateGeo = new THREE.BoxGeometry(0.72, 0.72, 0.72);
    this.beamGeo = new THREE.CylinderGeometry(0.42, 0.62, 7, 10, 1, true);
    this.crateBoxMat = new THREE.MeshLambertMaterial({ map: texWood, emissive: 0x2a1f08 });
    this.crateGlowMat = new THREE.MeshBasicMaterial({
      map: this.beamTex, blending: THREE.AdditiveBlending,
      transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    this.disposables.push(this.beamTex, this.crateGeo, this.beamGeo, this.crateBoxMat, this.crateGlowMat);
  }

  private buildCamp(
    boxGeo: THREE.BoxGeometry,
    cylGeo: THREE.CylinderGeometry,
  ): void {
    const { x, z } = BASE_POS;
    // радиомачта
    const mastMat = new THREE.MeshLambertMaterial({ color: 0x5a5347 });
    this.disposables.push(mastMat);
    const mast = new THREE.Mesh(cylGeo, mastMat);
    mast.scale.set(0.28, 8.5, 0.28);
    mast.position.set(x - 3, 4.25, z + 3.2);
    mast.castShadow = true;
    this.scene.add(mast);
    for (let i = 0; i < 3; i++) {
      const bar = new THREE.Mesh(boxGeo, mastMat);
      bar.scale.set(1.6 - i * 0.4, 0.08, 0.08);
      bar.position.set(x - 3, 6.6 + i * 0.7, z + 3.2);
      this.scene.add(bar);
    }
    const lightTex = makeGlowTexture('rgba(255,90,60,1)', 'rgba(255,60,40,0.5)');
    this.mastLightMat = new THREE.SpriteMaterial({
      map: lightTex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    const light = new THREE.Sprite(this.mastLightMat);
    light.scale.setScalar(1.1);
    light.position.set(x - 3, 8.7, z + 3.2);
    this.scene.add(light);
    this.disposables.push(lightTex, this.mastLightMat);

    // палатка: крыша + задник
    const tentMat = new THREE.MeshLambertMaterial({ color: 0x9a8358 });
    this.disposables.push(tentMat);
    const roof = new THREE.Mesh(boxGeo, tentMat);
    roof.scale.set(5.6, 0.2, 4.6);
    roof.position.set(x + 8.5, 2.9, z + 2);
    roof.rotation.z = 0.14;
    roof.castShadow = true;
    this.scene.add(roof);
    // антенна тарелка у верстака
    const dish = new THREE.Mesh(cylGeo, mastMat);
    dish.scale.set(1.5, 0.1, 1.5);
    dish.position.set(x + 2.6, 2.1, z + 3.4);
    dish.rotation.set(-0.9, 0, 0.3);
    this.scene.add(dish);
    const pole = new THREE.Mesh(cylGeo, mastMat);
    pole.scale.set(0.12, 2, 0.12);
    pole.position.set(x + 2.6, 1.1, z + 3.4);
    this.scene.add(pole);
  }

  /** ящик с лутом: золотой луч + вращающийся ящик */
  makeLootCrate(pos: THREE.Vector3): LootCrateView {
    const group = new THREE.Group();
    group.position.copy(pos);
    const crate = new THREE.Mesh(this.crateGeo, this.crateBoxMat);
    crate.position.y = 0.55;
    crate.castShadow = true;
    group.add(crate);
    const beam = new THREE.Mesh(this.beamGeo, this.crateGlowMat);
    beam.position.y = 3.5;
    group.add(beam);
    return {
      group,
      dispose: () => { group.removeFromParent(); },
    };
  }

  updateLootCrate(view: LootCrateView, t: number): void {
    const crate = view.group.children[0];
    if (crate) {
      crate.rotation.y = t * 1.4;
      crate.position.y = 0.55 + Math.sin(t * 2.2) * 0.09;
    }
  }

  update(t: number, dt: number, defense: boolean): void {
    this.time = t;
    // дымка пульсирует у ворот во время обороны
    const target = defense ? 0.55 + Math.sin(t * 3) * 0.25 : 0.18;
    this.gateMat.opacity += (target - this.gateMat.opacity) * Math.min(1, dt * 3);
    // мачта мигает
    this.mastLightMat.opacity = Math.sin(t * 2.4) > 0.3 ? 0.95 : 0.12;
    // пыль дрейфует
    const attr = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < arr.length / 3; i++) {
      const bx = this.dustBase[i * 3] ?? 0;
      const by = this.dustBase[i * 3 + 1] ?? 0;
      const bz = this.dustBase[i * 3 + 2] ?? 0;
      arr[i * 3] = bx + Math.sin(t * 0.24 + i * 1.7) * 3.2;
      arr[i * 3 + 1] = by + Math.sin(t * 0.4 + i * 2.3) * 0.6;
      arr[i * 3 + 2] = bz + Math.cos(t * 0.18 + i) * 2.6;
    }
    attr.needsUpdate = true;
  }

  /** точка для спавна врага у ворот (чуть внутрь арены) */
  gateSpawnPoint(index: number, rng: () => number): THREE.Vector3 {
    const g = this.spawnGates[index % this.spawnGates.length];
    if (!g) return new THREE.Vector3(0, 0, -ARENA.half + 2);
    const inward = Math.abs(g.x) > 30 ? -Math.sign(g.x) : 0;
    const inwardZ = Math.abs(g.z) > 30 ? -Math.sign(g.z) : 0;
    return new THREE.Vector3(
      g.x + inward * (1.5 + rng() * 2) + (rng() - 0.5) * 4,
      0,
      g.z + inwardZ * (1.5 + rng() * 2) + (rng() - 0.5) * 4,
    );
  }

  get clock(): number {
    return this.time;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
    this.scene.clear();
  }
}

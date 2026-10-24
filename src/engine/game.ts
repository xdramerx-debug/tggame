import * as THREE from 'three';
import { BASE_POS } from '../game/map';
import {
  ARENA, ENEMIES, ENEMY_NAMES, GEAR, PLAYER, WEAPONS, WEAPON_ORDER,
  type EnemyKind, type GamePhase, type GameSnapshot, type LootKind,
  type MetaProgress, type MinimapDot, type PerkId, type RunPhase,
  type WeaponId,
} from '../game/types';
import {
  AMMO_REFILL, ARMOR_ADD, killMoney, killScore, killXp, PRICES,
  START_MONEY, TUNING_MAX, tuningCost,
} from '../game/economy';
import { canTakePerk, levelFromXp, PERK_BY_ID, perkEffects, perkPointsAvailable } from '../game/perks';
import { crateAmount, crateCount, CRATE_LABEL, rollCrate } from '../game/loot';
import { addXp, finishRun, loadMeta, saveMeta } from '../game/save';
import {
  BANNER_S, EARLY_CALL_BONUS_PER_S, FIRST_SKIRMISH_S, INTERMISSION_S,
  MAX_ALIVE, waveComposition, waveMoneyBonus, waveXpBonus,
  type WaveComposition,
} from '../game/waves';
import { createRng, seedFromTime, type Rng } from '../game/rng';
import { World, type LootCrateView } from './world';
import { Enemy, type EnemyCtx, type EnemyEvent } from './enemy';
import { InputManager } from './input';
import { Particles } from './particles';
import { Decals, playerHit, rayEnv, resolvePellet, Tracers } from './weapons';
import { buildViewRig, disposeRigCache, disposeViewRig, type ViewRig } from './rig';
import { Player, type PlayerEvent, type QueuedActions, type ShotRequest } from './player';
import * as sfx from './audio';
import { haptics } from './haptics';

/**
 * Оркестратор забега: волны обороны ↔ вылазки с лутом и магазином,
 * экономика, мета-прогрессия, камера от первого лица, вьюмодель,
 * снаряды, взрывы, снимки состояния для UI (10 Гц) и события.
 */

export interface RunSummary {
  wave: number;
  kills: number;
  score: number;
  xpRun: number;
  level: number;
  bestWave: number;
  bestScore: number;
}

export type UiEvent =
  | { type: 'banner'; title: string; sub: string; tone: 'normal' | 'elite' | 'good' }
  | { type: 'toast'; text: string }
  | { type: 'killfeed'; text: string; head: boolean; elite: boolean }
  | { type: 'hurt'; angle: number }
  | { type: 'hitmark'; head: boolean; killed: boolean }
  | { type: 'levelup'; level: number; text: string }
  | { type: 'gameover'; summary: RunSummary };

export interface GameCallbacks {
  onSnapshot(s: GameSnapshot): void;
  onEvent(e: UiEvent): void;
}

interface Crate {
  view: LootCrateView;
  pos: THREE.Vector3;
  kind: LootKind;
  amount: number;
}

interface Grenade {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  fuse: number;
}

interface Spit {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  dmg: number;
}

const tmpEye = new THREE.Vector3();
const tmpV = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
export class Game {
  ok = false;
  readonly input = new InputManager();

  private canvas: HTMLCanvasElement;
  private cb: GameCallbacks;
  private renderer: THREE.WebGLRenderer | null = null;
  private camera: THREE.PerspectiveCamera;
  private world: World;
  private particles!: Particles;
  private tracers!: Tracers;
  private decals!: Decals;
  private rng: Rng = createRng(seedFromTime());

  private phase: GamePhase = 'menu';
  private run: RunPhase = 'skirmish';
  private player: Player | null = null;
  private viewRig: ViewRig | null = null;
  private enemies: Enemy[] = [];
  private crates: Crate[] = [];
  private grenades: Grenade[] = [];
  private spits: Spit[] = [];
  private enemyEvents: EnemyEvent[] = [];
  private playerEvents: PlayerEvent[] = [];

  private meta: MetaProgress = loadMeta();
  private wave = 1;
  private comp: WaveComposition = waveComposition(1);
  private spawnQueue: EnemyKind[] = [];
  private spawnTimer = 0;
  private nextEnemyId = 1;
  private eliteAnnounced = false;
  private intermissionT = FIRST_SKIRMISH_S;
  private money = START_MONEY;
  private parts = 0;
  private score = 0;
  private kills = 0;
  private runXp = 0;
  private shopOpen = false;
  private runGrantedSur4 = false;

  private clock = 0;
  private gameTime = 0;
  private deadT = 0;
  private shake = 0;
  private flashT = 0;
  private fov = 74;
  private snapAcc = 0;
  private last = 0;
  private raf = 0;
  private bannerHold = 0;

  private projGeo!: THREE.BoxGeometry;
  private projMat!: THREE.MeshLambertMaterial;
  private spitGeo!: THREE.SphereGeometry;
  private spitMat!: THREE.MeshLambertMaterial;

  private onResize = (): void => {
    if (!this.renderer) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private onVisibility = (): void => {
    if (document.hidden && this.phase === 'playing') this.pause();
  };

  constructor(canvas: HTMLCanvasElement, cb: GameCallbacks) {
    this.canvas = canvas;
    this.cb = cb;
    this.camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 420);
    this.world = new World();
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    } catch {
      this.renderer = null;
    }
    if (!this.renderer) {
      this.world.dispose();
      return;
    }
    this.ok = true;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;

    const scene = this.world.scene;
    scene.add(this.camera);
    this.particles = new Particles();
    scene.add(this.particles.points);
    this.tracers = new Tracers();
    scene.add(this.tracers.mesh);
    this.decals = new Decals();
    scene.add(this.decals.group);

    this.projGeo = new THREE.BoxGeometry(0.17, 0.17, 0.17);
    this.projMat = new THREE.MeshLambertMaterial({ color: 0x3c4a30, emissive: 0x141c0a });
    this.spitGeo = new THREE.SphereGeometry(0.17, 10, 8);
    this.spitMat = new THREE.MeshLambertMaterial({ color: 0x9fd93a, emissive: 0x6fa020 });

    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /* ---------- lifecycle ---------- */

  start(): void {
    if (!this.ok) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    this.cb.onSnapshot(this.buildSnapshot());
  }

  attachInput(left: HTMLElement, right: HTMLElement): void {
    this.input.attach(left, right, this.canvas);
  }

  getMeta(): MetaProgress {
    return this.meta;
  }

  startRun(): void {
    if (!this.ok) return;
    sfx.unlockAudio();
    this.clearRunEntities();
    this.meta = loadMeta();
    this.player = new Player(this.meta.perks, BASE_POS);
    this.runGrantedSur4 = this.player.effects.startMedkit;
    this.wave = 1;
    this.money = START_MONEY;
    this.parts = 0;
    this.score = 0;
    this.kills = 0;
    this.runXp = 0;
    this.gameTime = 0;
    this.deadT = 0;
    this.shopOpen = false;
    this.eliteAnnounced = false;
    this.rng = createRng(seedFromTime());
    this.phase = 'playing';
    this.run = 'skirmish';
    this.intermissionT = FIRST_SKIRMISH_S;
    this.spawnCrates(crateCount(1));
    this.rebuildView();
    sfx.startWind();
    this.banner('ВЫЛАЗКА', 'Радио: закупка и тюнинг. Собери ящики до первой волны', 'good');
    this.cb.onSnapshot(this.buildSnapshot());
  }

  pause(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'paused';
    this.input.setFire(false);
    this.cb.onSnapshot(this.buildSnapshot());
  }

  resume(): void {
    if (this.phase !== 'paused') return;
    this.phase = 'playing';
    this.last = performance.now();
    this.cb.onSnapshot(this.buildSnapshot());
  }

  restart(): void {
    this.startRun();
  }

  toMenu(): void {
    this.clearRunEntities();
    this.phase = 'menu';
    sfx.stopWind();
    this.cb.onSnapshot(this.buildSnapshot());
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.input.detach();
    this.clearRunEntities();
    this.projGeo.dispose();
    this.projMat.dispose();
    this.spitGeo.dispose();
    this.spitMat.dispose();
    this.particles.dispose();
    this.tracers.dispose();
    this.decals.dispose();
    this.world.dispose();
    disposeRigCache();
    sfx.stopWind();
    this.renderer?.dispose();
  }

  /* ---------- магазин ---------- */

  openShop(): void {
    if (this.phase !== 'playing') return;
    if (this.run !== 'skirmish') {
      this.cb.onEvent({ type: 'toast', text: 'Магазин доступен только в вылазке' });
      sfx.sfxDeny();
      return;
    }
    this.shopOpen = true;
    this.input.setFire(false);
    sfx.sfxUi();
    this.cb.onSnapshot(this.buildSnapshot());
  }

  closeShop(): void {
    if (!this.shopOpen) return;
    this.shopOpen = false;
    sfx.sfxUi();
    this.cb.onSnapshot(this.buildSnapshot());
  }

  private deny(text: string): void {
    this.cb.onEvent({ type: 'toast', text });
    sfx.sfxDeny();
  }

  buyGear(kind: 'armor' | 'grenade' | 'medkit' | 'ammo'): void {
    const p = this.player;
    if (!p || this.phase !== 'playing') return;
    const price = PRICES[kind];
    if (this.money < price) {
      this.deny('Не хватает денег');
      return;
    }
    switch (kind) {
      case 'armor':
        if (p.armor >= p.armorMax) { this.deny('Броня уже полная'); return; }
        p.armor = Math.min(p.armorMax, p.armor + ARMOR_ADD);
        this.cb.onEvent({ type: 'toast', text: `🛡️ Броня +${ARMOR_ADD}` });
        break;
      case 'grenade': {
        const cap = GEAR.grenadeMax + p.effects.grenadeBonus;
        if (p.grenades >= cap) { this.deny('Гранат достаточно'); return; }
        p.grenades += 1;
        this.cb.onEvent({ type: 'toast', text: '💣 Граната +1' });
        break;
      }
      case 'medkit':
        if (p.medkits >= GEAR.medkitMax) { this.deny('Аптечек достаточно'); return; }
        p.medkits += 1;
        this.cb.onEvent({ type: 'toast', text: '❤️ Аптечка +1' });
        break;
      case 'ammo':
        if (p.reserveCur < 0) { this.deny('У пистолета бесконечный запас'); return; }
        p.addReserve(p.weapon, AMMO_REFILL);
        this.cb.onEvent({ type: 'toast', text: `🧰 Патроны +${AMMO_REFILL} (${WEAPONS[p.weapon].name})` });
        break;
    }
    this.money -= price;
    sfx.sfxBuy();
    haptics.buy();
    this.cb.onSnapshot(this.buildSnapshot());
  }

  buyWeapon(id: WeaponId): void {
    const p = this.player;
    if (!p || this.phase !== 'playing') return;
    if (p.owned.includes(id)) { this.deny('Уже куплено'); return; }
    const spec = WEAPONS[id];
    const lv = levelFromXp(this.meta.xp).level;
    if (lv < spec.unlockLevel) { this.deny(`Нужен уровень ${spec.unlockLevel}`); return; }
    if (this.money < spec.price) { this.deny('Не хватает денег'); return; }
    this.money -= spec.price;
    p.ownWeapon(id);
    this.rebuildView();
    this.cb.onEvent({ type: 'toast', text: `🔫 ${spec.name} куплен` });
    sfx.sfxBuy();
    haptics.buy();
    this.cb.onSnapshot(this.buildSnapshot());
  }

  equipWeapon(id: WeaponId): void {
    const p = this.player;
    if (!p || !p.owned.includes(id) || p.weapon === id) return;
    p.switchTo(id);
    this.rebuildView();
    sfx.sfxSwitch();
    this.cb.onSnapshot(this.buildSnapshot());
  }

  tuneWeapon(id: WeaponId): void {
    const p = this.player;
    if (!p || this.phase !== 'playing') return;
    if (!p.owned.includes(id)) { this.deny('Сначала купи оружие'); return; }
    const tier = p.tuning[id];
    const cost = tuningCost(tier);
    if (!cost) { this.deny('Максимальный тир'); return; }
    if (this.money < cost.money || this.parts < cost.parts) {
      this.deny('Не хватает денег или деталей');
      return;
    }
    if (tier + 1 > TUNING_MAX) { this.deny('Максимальный тир'); return; }
    this.money -= cost.money;
    this.parts -= cost.parts;
    p.setTuning(id, tier + 1);
    this.cb.onEvent({ type: 'toast', text: `⚙️ ${WEAPONS[id].name}: тир ${tier + 1}` });
    sfx.sfxBuy();
    this.cb.onSnapshot(this.buildSnapshot());
  }

  takePerk(id: PerkId): void {
    if (this.phase !== 'playing') return;
    if (!canTakePerk(this.meta.perks, id)) { this.deny('Перк недоступен'); return; }
    if (perkPointsAvailable(this.meta) <= 0) { this.deny('Нет очков перков'); return; }
    this.meta = { ...this.meta, perks: [...this.meta.perks, id] };
    saveMeta(this.meta);
    this.refreshPerks();
    if (id === 'sur4' && !this.runGrantedSur4) {
      this.runGrantedSur4 = true;
      if (this.player) this.player.medkits += 1;
    }
    this.cb.onEvent({ type: 'toast', text: `✨ Перк: ${PERK_BY_ID[id].name}` });
    sfx.sfxBuy();
    haptics.levelUp();
    this.cb.onSnapshot(this.buildSnapshot());
  }

  callWaveEarly(): void {
    if (this.phase !== 'playing' || this.run !== 'skirmish') return;
    const bonus = Math.ceil(Math.max(0, this.intermissionT)) * EARLY_CALL_BONUS_PER_S;
    this.money += bonus;
    this.cb.onEvent({ type: 'toast', text: `⚡ Ранний вызов волны: +${bonus}₽` });
    this.startDefense();
  }

  /* ---------- ядро цикла ---------- */

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const dtRaw = Math.min(0.05, Math.max(0.001, (now - this.last) / 1000));
    this.last = now;
    this.clock += dtRaw;
    if (this.bannerHold > 0) this.bannerHold -= dtRaw;

    if (this.phase === 'menu') {
      this.updateMenuCam();
      this.world.update(this.clock, dtRaw, false);
      this.particles.update(dtRaw);
    } else if (this.phase === 'playing' && !this.shopOpen) {
      this.updatePlay(dtRaw);
    } else if (this.phase === 'over') {
      this.updateOver(dtRaw);
    }

    if (this.renderer) this.renderer.render(this.world.scene, this.camera);

    this.snapAcc += dtRaw;
    if (this.snapAcc >= 0.1) {
      this.snapAcc = 0;
      this.cb.onSnapshot(this.buildSnapshot());
    }
  };

  private updateMenuCam(): void {
    const a = this.clock * 0.055;
    this.camera.position.set(Math.sin(a) * 46, 16 + Math.sin(a * 0.7) * 3, Math.cos(a) * 46);
    this.camera.lookAt(0, 3, 0);
    this.camera.rotation.z = 0;
  }

  private updateOver(dt: number): void {
    this.deadT += dt;
    const p = this.player;
    if (!p) return;
    const k = Math.min(1, this.deadT / 1.3);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.z = k * 0.55;
    this.camera.position.set(
      p.pos.x,
      p.pos.y + PLAYER.eye * (1 - k) + 0.45 * k,
      p.pos.z,
    );
    this.camera.rotation.x = p.pitch * (1 - k) - k * 0.25;
    this.camera.rotation.y = p.yaw + Math.PI;
    this.world.update(this.clock, dt, false);
    this.particles.update(dt);
    this.tracers.update(dt);
    // враги продолжают двигаться вокруг тела
    this.updateEnemies(dt);
  }

  private updatePlay(dt: number): void {
    const p = this.player;
    if (!p) return;
    this.gameTime += dt;

    const look = this.input.consumeLook();
    const queuedRaw = this.input.takeQueued();
    if (queuedRaw.pause) {
      this.pause();
      return;
    }
    const inp = this.input.snapshot();
    const queued: QueuedActions = {
      jump: queuedRaw.jump,
      reload: queuedRaw.reload,
      grenade: queuedRaw.grenade,
      medkit: queuedRaw.medkit,
      dash: queuedRaw.dash,
      crouchToggle: queuedRaw.crouchToggle,
    };
    this.input.applyCrouch(p.crouched);

    p.update(dt, this.gameTime, inp, look, queued, this.world.collider, ARENA.half - 1, this.playerEvents);
    this.handlePlayerEvents();

    // стрельба
    if (inp.fireHeld && !p.dead) {
      const req = p.tryFire(this.rng, this.playerEvents);
      if (req) this.processShot(req);
      this.handlePlayerEvents();
    }

    // директор волн
    if (this.run === 'skirmish') {
      this.intermissionT -= dt;
      if (this.intermissionT <= 0) this.startDefense();
    } else {
      this.updateDefense(dt);
    }

    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateCrates();

    this.particles.update(dt);
    this.tracers.update(dt);
    this.world.update(this.clock, dt, this.run === 'defense');
    this.updateCamera(dt, p);
    this.updateViewmodel(dt, p);
  }

  private handlePlayerEvents(): void {
    for (const ev of this.playerEvents) {
      switch (ev.type) {
        case 'step':
          sfx.sfxFootstep();
          break;
        case 'jump':
          sfx.sfxJump();
          break;
        case 'land':
          sfx.sfxLand(ev.hard);
          if (ev.hard && this.player) {
            this.shake = Math.max(this.shake, 0.16);
            tmpV.set(this.player.pos.x, 0.1, this.player.pos.z);
            this.particles.spawn('sand', tmpV, null, 1.7, 7);
          }
          break;
        case 'dash':
          sfx.sfxDash();
          break;
        case 'reloadStart':
          sfx.sfxReload('out');
          break;
        case 'reloadEnd':
          sfx.sfxReload('in');
          break;
        case 'dryFire':
          sfx.sfxDryFire();
          break;
        case 'switch':
          sfx.sfxSwitch();
          break;
        case 'grenadeThrow':
          sfx.sfxDash();
          this.throwGrenade();
          break;
        case 'medkit':
          sfx.sfxMedkit();
          this.cb.onEvent({ type: 'toast', text: '❤️ Аптечка использована' });
          break;
      }
    }
    this.playerEvents.length = 0;
  }

  private throwGrenade(): void {
    const p = this.player;
    if (!p) return;
    const mesh = new THREE.Mesh(this.projGeo, this.projMat);
    const dir = p.lookDir(tmpDir);
    mesh.position.set(
      p.pos.x + dir.x * 0.4,
      p.pos.y + p.eyeCur - 0.1,
      p.pos.z + dir.z * 0.4,
    );
    this.world.scene.add(mesh);
    this.grenades.push({
      mesh,
      vel: new THREE.Vector3(dir.x * 13.5, dir.y * 13.5 + 3.2, dir.z * 13.5),
      fuse: 2,
    });
  }

  private processShot(req: ShotRequest): void {
    const p = this.player;
    if (!p) return;
    sfx.sfxShot(req.weapon);
    haptics.shot(req.weapon === 'shotgun' || req.weapon === 'sniper');
    // вспышка вьюмодели
    if (this.viewRig) {
      this.viewRig.flash.visible = true;
      this.viewRig.flash.material.rotation = this.rng() * Math.PI * 2;
      this.viewRig.flash.scale.setScalar(0.22 + this.rng() * 0.12);
      this.viewRig.flashLight.intensity = 4.5;
      this.flashT = 0.05;
    }
    // гильза
    const rx = -Math.cos(p.yaw);
    const rz = Math.sin(p.yaw);
    tmpV.set(p.pos.x + rx * 0.2, p.pos.y + p.eyeCur - 0.12, p.pos.z + rz * 0.2);
    tmpDir.set(rx + 0.4, 1.1, rz + (this.rng() - 0.5));
    this.particles.spawn('shell', tmpV, tmpDir, 1.6, 1);

    for (let i = 0; i < req.pellets; i++) {
      const res = resolvePellet(
        req.ox, req.oy, req.oz, req.dx, req.dy, req.dz,
        req.spread, this.rng, this.enemies, this.world.collider, req.range,
      );
      this.tracers.spawn(req.ox, req.oy, req.oz, res.ex, res.ey, res.ez);
      if (res.enemy) {
        const e = res.enemy;
        let dmg = req.dmg * (e.head ? req.headMult : 1);
        let crit = false;
        if (this.rng() < req.critChance) {
          dmg *= req.critMult;
          crit = true;
        }
        const killed = this.damageEnemy(e.enemy, dmg, e.head, p.pos.x, p.pos.z, req.ox, req.oy, req.oz);
        this.cb.onEvent({ type: 'hitmark', head: e.head || crit, killed });
        sfx.sfxHitmarker(e.head || crit);
        if (e.head || crit) haptics.headshot(); else haptics.hit();
      } else {
        tmpV.set(res.ex, res.ey, res.ez);
        if (res.env) {
          this.decals.add(res.env.x, res.env.y, res.env.z, res.env.nx, res.env.ny, res.env.nz);
          this.particles.spawn(res.env.ny > 0.5 ? 'sand' : 'spark', tmpV, null, 1.6, 4);
        }
        if (this.rng() < 0.22) sfx.sfxRicochet();
      }
    }
  }

  private damageEnemy(
    e: Enemy, dmg: number, head: boolean, fx: number, fz: number,
    hx: number, hy: number, hz: number,
  ): boolean {
    const killed = e.damage(dmg, head, fx, fz);
    tmpV.set(hx, hy, hz);
    this.particles.spawn('blood', tmpV, null, 3.4, head ? 9 : 5);
    if (killed) this.onKill(e, head);
    return killed;
  }

  private onKill(e: Enemy, head: boolean): void {
    const kind = e.kind;
    const spec = ENEMIES[kind];
    const m = killMoney(kind);
    this.money += m;
    this.score += killScore(kind);
    this.kills += 1;
    this.addXpRun(killXp(kind));
    this.cb.onEvent({
      type: 'killfeed',
      text: `${head ? '🎯 ' : ''}${ENEMY_NAMES[kind]} · +${m}₽`,
      head,
      elite: spec.elite,
    });
    sfx.sfxEnemyDie(spec.elite);
    haptics.kill();
    e.headCenter(tmpV);
    tmpV.y -= 0.3;
    this.particles.spawn('blood', tmpV, null, 4.2, spec.elite ? 18 : 8);
    if (spec.elite) {
      this.shake = Math.max(this.shake, 0.4);
      this.cb.onEvent({ type: 'toast', text: `💀 Элита (${ENEMY_NAMES[kind]}) повержена!` });
    }
  }

  private addXpRun(amount: number): void {
    this.runXp += amount;
    const r = addXp(this.meta, amount);
    this.meta = r.meta;
    if (r.levelsGained > 0) {
      const lv = levelFromXp(this.meta.xp).level;
      const bonus = 100 * r.levelsGained;
      this.money += bonus;
      if (this.player && !this.player.dead) {
        this.player.hp = this.player.maxHp;
      }
      saveMeta(this.meta);
      this.cb.onEvent({
        type: 'levelup',
        level: lv,
        text: `Уровень ${lv}: полное лечение, +${bonus}₽, +1 очко перка`,
      });
      this.banner('УРОВЕНЬ ПОВЫШЕН', `Уровень ${lv} · очко перков в радио-меню`, 'good');
      sfx.sfxLevelUp();
      haptics.levelUp();
    }
  }

  private refreshPerks(): void {
    const p = this.player;
    if (!p) return;
    const fx = perkEffects(this.meta.perks);
    p.effects = fx;
    const newMax = PLAYER.maxHp + fx.maxHpBonus;
    if (newMax > p.maxHp) p.hp += newMax - p.maxHp;
    p.maxHp = newMax;
    p.hp = Math.min(p.hp, p.maxHp);
    p.armorMax = PLAYER.armorMax + fx.armorBonus;
    p.armor = Math.min(p.armor, p.armorMax);
  }

  /* ---------- волны ---------- */

  private startDefense(): void {
    this.run = 'defense';
    this.comp = waveComposition(this.wave);
    this.spawnQueue = [];
    for (const kind of Object.keys(this.comp.counts) as EnemyKind[]) {
      const n = this.comp.counts[kind] ?? 0;
      for (let i = 0; i < n; i++) this.spawnQueue.push(kind);
    }
    // перемешивание, но элиту не в самую первую пачку
    for (let i = this.spawnQueue.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      const a = this.spawnQueue[i];
      const b = this.spawnQueue[j];
      if (!a || !b) continue;
      this.spawnQueue[i] = b;
      this.spawnQueue[j] = a;
    }
    this.spawnTimer = 1.2;
    this.eliteAnnounced = false;
    this.shopOpen = false;
    this.cb.onEvent({
      type: 'banner',
      title: `ВОЛНА ${this.wave}`,
      sub: this.comp.elite
        ? `⚠️ ЭЛИТА · ${this.comp.total} врагов`
        : `${this.comp.total} врагов · держи рубеж`,
      tone: this.comp.elite ? 'elite' : 'normal',
    });
    this.bannerHold = BANNER_S;
    sfx.sfxWaveHorn();
    haptics.waveStart();
  }

  private updateDefense(dt: number): void {
    this.spawnTimer -= dt;
    const alive = this.enemies.reduce((s, e) => s + (e.solid ? 1 : 0), 0);
    const next = this.spawnQueue[0];
    if (this.spawnTimer <= 0 && next && alive < MAX_ALIVE) {
      this.spawnTimer = this.comp.spawnEvery;
      this.spawnQueue.shift();
      this.spawnEnemy(next);
    }
    if (this.spawnQueue.length === 0 && this.enemies.length === 0) {
      this.waveComplete();
    }
  }

  private spawnEnemy(kind: EnemyKind): void {
    const p = this.player;
    // выбираем дальние от игрока ворота
    const gates = this.world.spawnGates;
    let bestIdx = 0;
    let bestScore = -1;
    for (let i = 0; i < gates.length; i++) {
      const g = gates[i];
      if (!g) continue;
      const d = p ? Math.hypot(g.x - p.pos.x, g.z - p.pos.z) : 40;
      const s = d + this.rng() * 14;
      if (s > bestScore) {
        bestScore = s;
        bestIdx = i;
      }
    }
    const pos = this.world.gateSpawnPoint(bestIdx, this.rng);
    const e = new Enemy(this.nextEnemyId++, kind, pos, this.comp.hpMult, this.rng);
    this.world.scene.add(e.rig.parts.root);
    this.enemies.push(e);
    tmpV.set(pos.x, 0.2, pos.z);
    this.particles.spawn('sand', tmpV, null, 2.2, 8);
    if (ENEMIES[kind].elite && !this.eliteAnnounced) {
      this.eliteAnnounced = true;
      this.cb.onEvent({ type: 'toast', text: `⚠️ ${ENEMY_NAMES[kind]} вышел на карту!` });
    }
  }

  private waveComplete(): void {
    const survived = this.wave;
    const bonus = waveMoneyBonus(survived);
    this.money += bonus;
    this.score += 100 * survived;
    this.addXpRun(waveXpBonus(survived));
    this.wave += 1;
    this.run = 'skirmish';
    this.intermissionT = INTERMISSION_S;
    this.spawnCrates(crateCount(this.wave));
    this.cb.onEvent({
      type: 'banner',
      title: `ВОЛНА ${survived} ЗАЧИЩЕНА`,
      sub: `+${bonus}₽ · вылазка ${INTERMISSION_S} с · радио открыто`,
      tone: 'good',
    });
    this.bannerHold = BANNER_S;
  }

  /* ---------- ящики ---------- */

  private spawnCrates(n: number): void {
    const spots = [...this.world.crateSpots];
    for (let i = spots.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      const a = spots[i];
      const b = spots[j];
      if (!a || !b) continue;
      spots[i] = b;
      spots[j] = a;
    }
    const taken = Math.min(n, spots.length);
    for (let i = 0; i < taken; i++) {
      const s = spots[i];
      if (!s) continue;
      const pos = new THREE.Vector3(s.x, 0, s.z);
      const kind = rollCrate(this.rng);
      const amount = crateAmount(kind, this.rng, this.wave);
      const view = this.world.makeLootCrate(pos);
      this.world.scene.add(view.group);
      this.crates.push({ view, pos, kind, amount });
    }
  }

  private updateCrates(): void {
    const p = this.player;
    if (!p) return;
    for (let i = this.crates.length - 1; i >= 0; i--) {
      const c = this.crates[i];
      if (!c) continue;
      this.world.updateLootCrate(c.view, this.clock);
      const d = Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z);
      if (d < 1.6) {
        this.applyLoot(c);
        this.world.scene.remove(c.view.group);
        c.view.dispose();
        this.crates.splice(i, 1);
      }
    }
  }

  private applyLoot(c: Crate): void {
    const p = this.player;
    if (!p) return;
    switch (c.kind) {
      case 'money':
        this.money += c.amount;
        break;
      case 'parts':
        this.parts += c.amount;
        break;
      case 'ammo':
        p.addReserve(p.weapon, c.amount);
        break;
      case 'armor':
        p.armor = Math.min(p.armorMax, p.armor + c.amount);
        break;
      case 'grenade':
        p.grenades = Math.min(GEAR.grenadeMax + p.effects.grenadeBonus, p.grenades + c.amount);
        break;
      case 'medkit':
        p.medkits = Math.min(GEAR.medkitMax, p.medkits + c.amount);
        break;
      case 'xp':
        this.addXpRun(c.amount);
        break;
    }
    this.cb.onEvent({ type: 'toast', text: `${CRATE_LABEL[c.kind]} +${c.amount}` });
    sfx.sfxPickup();
    haptics.pickup();
    tmpV.copy(c.pos).setY(0.8);
    this.particles.spawn('spark', tmpV, null, 2.4, 8);
  }

  /* ---------- враги и снаряды ---------- */

  private updateEnemies(dt: number): void {
    const p = this.player;
    if (!p) return;
    p.eyePos(tmpEye);
    const ctx: EnemyCtx = {
      dt,
      time: this.gameTime,
      playerFeet: p.pos,
      playerEye: tmpEye,
      playerVel: p.vel,
      collider: this.world.collider,
      others: this.enemies,
      rng: this.rng,
      dmgMult: this.comp.dmgMult,
      spreadMult: this.comp.spreadMult,
      bound: ARENA.half - 1,
      events: this.enemyEvents,
    };
    this.enemyEvents.length = 0;
    for (const e of this.enemies) e.update(ctx);
    for (const ev of this.enemyEvents) this.handleEnemyEvent(ev);
    this.enemyEvents.length = 0;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e) continue;
      if (e.remove) {
        e.dispose();
        this.enemies.splice(i, 1);
      }
    }
  }

  private handleEnemyEvent(ev: EnemyEvent): void {
    const p = this.player;
    if (!p || p.dead) return;
    switch (ev.type) {
      case 'shot': {
        const tP = playerHit(
          ev.ox, ev.oy, ev.oz, ev.dx, ev.dy, ev.dz,
          p.pos.x, p.pos.y, p.pos.z, p.crouched,
        );
        const tE = rayEnv(ev.ox, ev.oy, ev.oz, ev.dx, ev.dy, ev.dz, this.world.collider, 90);
        if (tP !== null && (!tE || tP < tE.t)) {
          const hx = ev.ox + ev.dx * tP;
          const hy = ev.oy + ev.dy * tP;
          const hz = ev.oz + ev.dz * tP;
          this.tracers.spawn(ev.ox, ev.oy, ev.oz, hx, hy, hz);
          this.hurtPlayer(ev.dmg, ev.ox, ev.oz);
        } else {
          const t = tE ? tE.t : 60;
          this.tracers.spawn(ev.ox, ev.oy, ev.oz, ev.ox + ev.dx * t, ev.oy + ev.dy * t, ev.oz + ev.dz * t);
          if (tE) {
            tmpV.set(tE.x, tE.y, tE.z);
            this.particles.spawn('sand', tmpV, null, 1.2, 3);
          }
        }
        break;
      }
      case 'melee': {
        // найти ближайшего атакующего для направления
        let srcX = p.pos.x + 1;
        let srcZ = p.pos.z;
        let best = 1e9;
        for (const e of this.enemies) {
          if (!e.solid || e.kind !== ev.kind) continue;
          const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
          if (d < best) {
            best = d;
            srcX = e.pos.x;
            srcZ = e.pos.z;
          }
        }
        if (best < 4.5) {
          this.hurtPlayer(ev.dmg, srcX, srcZ);
          const dx = p.pos.x - srcX;
          const dz = p.pos.z - srcZ;
          const d = Math.hypot(dx, dz) || 1;
          p.vel.x += (dx / d) * ev.knock;
          p.vel.z += (dz / d) * ev.knock;
        }
        break;
      }
      case 'spit': {
        const mesh = new THREE.Mesh(this.spitGeo, this.spitMat);
        mesh.position.set(ev.ox, ev.oy, ev.oz);
        this.world.scene.add(mesh);
        const dx = ev.tx - ev.ox;
        const dz = ev.tz - ev.oz;
        const dist = Math.hypot(dx, dz);
        const T = Math.max(0.45, Math.min(1.5, dist / 16));
        this.spits.push({
          mesh,
          vel: new THREE.Vector3(dx / T, (ev.ty - ev.oy) / T + 0.5 * 14 * T, dz / T),
          dmg: ev.dmg,
        });
        break;
      }
      case 'sfx':
        switch (ev.name) {
          case 'shot': sfx.sfxEnemyShot(Math.min(48, ev.dist)); break;
          case 'roar': if (ev.dist < 55) sfx.sfxTitanRoar(); break;
          case 'hiss': if (ev.dist < 45) sfx.sfxSpitHiss(); break;
          case 'swing': if (ev.dist < 14) sfx.sfxDash(); break;
        }
        break;
    }
  }

  private updateProjectiles(dt: number): void {
    const p = this.player;
    // гранаты
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      if (!g) continue;
      g.vel.y -= 16 * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      g.mesh.rotation.x += dt * 8;
      g.mesh.rotation.z += dt * 5;
      if (g.mesh.position.y < 0.12) {
        g.mesh.position.y = 0.12;
        g.vel.y *= -0.38;
        g.vel.x *= 0.62;
        g.vel.z *= 0.62;
      }
      g.fuse -= dt;
      if (g.fuse <= 0) {
        this.explode(g.mesh.position, true);
        this.world.scene.remove(g.mesh);
        this.grenades.splice(i, 1);
      }
    }
    // кислота
    if (!p) return;
    for (let i = this.spits.length - 1; i >= 0; i--) {
      const s = this.spits[i];
      if (!s) continue;
      s.vel.y -= 14 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      if (this.rng() < 0.5) this.particles.spawn('acid', s.mesh.position, null, 0.4, 1, 0.5);
      const dx = s.mesh.position.x - p.pos.x;
      const dy = s.mesh.position.y - (p.pos.y + 0.9);
      const dz = s.mesh.position.z - p.pos.z;
      const direct = dx * dx + dy * dy + dz * dz < 0.85;
      if (direct && !p.dead) {
        this.hurtPlayer(s.dmg, s.mesh.position.x, s.mesh.position.z);
        this.particles.spawn('acid', s.mesh.position, null, 2.6, 10);
        sfx.sfxSplash();
        this.world.scene.remove(s.mesh);
        this.spits.splice(i, 1);
        continue;
      }
      if (s.mesh.position.y <= 0.16) {
        const d = Math.hypot(s.mesh.position.x - p.pos.x, s.mesh.position.z - p.pos.z);
        if (d < 3.1 && !p.dead) {
          this.hurtPlayer(s.dmg * Math.max(0.45, 1 - d / 3.4), s.mesh.position.x, s.mesh.position.z);
        }
        this.particles.spawn('acid', s.mesh.position, null, 2.8, 12);
        sfx.sfxSplash();
        this.world.scene.remove(s.mesh);
        this.spits.splice(i, 1);
      }
    }
  }

  private explode(pos: THREE.Vector3, friendly: boolean): void {
    const R = GEAR.grenadeRadius;
    const p = this.player;
    for (const e of this.enemies) {
      if (!e.solid) continue;
      const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) + Math.abs(e.pos.y - pos.y) * 0.4;
      if (d >= R) continue;
      const falloff = Math.max(0.25, 1 - d / R);
      this.damageEnemy(e, GEAR.grenadeDmg * falloff, false, pos.x, pos.z, e.pos.x, e.pos.y + 0.9, e.pos.z);
    }
    this.particles.spawn('smoke', pos, null, 3.2, 14, 1.3);
    this.particles.spawn('spark', pos, null, 7, 18);
    this.particles.spawn('sand', pos, null, 5, 12);
    this.decals.addScorch(pos.x, pos.z);
    if (p && !p.dead) {
      const pd = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z);
      if (friendly && pd < R) {
        this.hurtPlayer(GEAR.grenadeDmg * 0.3 * Math.max(0.3, 1 - pd / R), pos.x, pos.z);
      }
      this.shake = Math.max(this.shake, 0.65 * Math.max(0.15, 1 - pd / 20));
      sfx.sfxExplosion(pd);
    } else {
      sfx.sfxExplosion(20);
    }
    haptics.explosion();
  }

  private hurtPlayer(dmg: number, fx: number, fz: number): void {
    const p = this.player;
    if (!p || p.dead || this.phase !== 'playing') return;
    const res = p.damage(dmg, fx, fz, this.gameTime);
    this.cb.onEvent({ type: 'hurt', angle: res.relAngle });
    this.shake = Math.min(0.6, this.shake + 0.1 + dmg / 110);
    if (dmg >= 25) haptics.heavyHurt(); else haptics.hurt();
    sfx.sfxHurt();
    if (res.killed) this.gameOver();
  }

  private gameOver(): void {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.deadT = 0;
    this.shopOpen = false;
    this.input.setFire(false);
    sfx.stopWind();
    sfx.sfxDeath();
    haptics.death();
    const survived = Math.max(0, this.wave - 1);
    this.meta = finishRun(this.meta, survived, this.score, this.kills);
    saveMeta(this.meta);
    const summary: RunSummary = {
      wave: survived,
      kills: this.kills,
      score: this.score,
      xpRun: this.runXp,
      level: levelFromXp(this.meta.xp).level,
      bestWave: this.meta.bestWave,
      bestScore: this.meta.bestScore,
    };
    this.cb.onEvent({ type: 'gameover', summary });
    this.cb.onSnapshot(this.buildSnapshot());
  }

  private banner(title: string, sub: string, tone: 'normal' | 'elite' | 'good'): void {
    this.cb.onEvent({ type: 'banner', title, sub, tone });
    this.bannerHold = BANNER_S;
  }

  /* ---------- камера и вьюмодель ---------- */

  private rebuildView(): void {
    const p = this.player;
    if (!p) return;
    if (this.viewRig) {
      this.camera.remove(this.viewRig.root);
      disposeViewRig(this.viewRig);
      this.viewRig = null;
    }
    const v = buildViewRig(p.weapon);
    v.root.traverse((o) => {
      o.castShadow = false;
      o.receiveShadow = false;
    });
    v.root.position.set(0.16, -0.15, -0.3);
    this.camera.add(v.root);
    this.viewRig = v;
  }

  private updateCamera(dt: number, p: Player): void {
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.x = p.pitch + p.pitchKick;
    this.camera.rotation.y = p.yaw + p.yawKick + Math.PI;
    this.camera.rotation.z = 0;

    const moveK = p.onGround && p.moving ? 1 : 0.18;
    const bobX = Math.cos(p.bobPhase) * 0.021 * moveK;
    const bobY = Math.abs(Math.sin(p.bobPhase)) * 0.019 * moveK;
    const rx = -Math.cos(p.yaw);
    const rz = Math.sin(p.yaw);

    this.shake = Math.max(0, this.shake - dt * 2.4);
    const s = this.shake * this.shake;
    const jx = (this.rng() - 0.5) * s * 0.5;
    const jy = (this.rng() - 0.5) * s * 0.5;
    const jr = (this.rng() - 0.5) * s * 0.24;

    this.camera.position.set(
      p.pos.x + rx * bobX + jx,
      p.pos.y + p.eyeCur + bobY + jy,
      p.pos.z + rz * bobX,
    );
    this.camera.rotation.z += jr;

    const target = 74 + (p.sprinting ? 4 : 0);
    this.fov += (target - this.fov) * Math.min(1, dt * 8);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  private updateViewmodel(dt: number, p: Player): void {
    const v = this.viewRig;
    if (!v) return;
    if (v.weapon !== p.weapon) {
      this.rebuildView();
      return;
    }
    const moveK = p.moving ? 1 : 0;
    const bobX = Math.cos(p.bobPhase) * 0.014 * moveK;
    const bobY = Math.abs(Math.sin(p.bobPhase)) * 0.02 * moveK
      + Math.sin(this.clock * 1.6) * 0.0035 * (1 - moveK);
    v.root.position.set(0.16 + bobX, -0.15 + bobY, -0.3);
    v.root.rotation.x = 0;

    const k = p.vmKick;
    v.gun.position.z = k * 0.085;
    v.gun.rotation.x = k * 0.26;
    v.gun.position.y = 0;
    v.gun.rotation.z = 0;

    if (p.reloading && p.reloadDur > 0) {
      const t = Math.min(1, p.reloadT / p.reloadDur);
      const dip = Math.sin(t * Math.PI);
      v.gun.rotation.x += dip * 0.75;
      v.gun.position.y -= dip * 0.13;
      v.gun.rotation.z = dip * 0.22;
    }
    if (p.drawT > 0) {
      const d = Math.min(1, p.drawT / 0.5);
      v.root.position.y -= d * 0.4;
      v.root.rotation.x = d * 0.55;
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      const kf = Math.max(0, this.flashT / 0.05);
      v.flashLight.intensity = 4.5 * kf;
      if (this.flashT <= 0) {
        v.flash.visible = false;
        v.flashLight.intensity = 0;
      }
    }
  }

  /* ---------- снимок ---------- */

  private buildSnapshot(): GameSnapshot {
    const p = this.player;
    const lv = levelFromXp(this.meta.xp);
    const minimap: MinimapDot[] = [];
    if (p && this.phase !== 'menu') {
      let added = 0;
      for (const e of this.enemies) {
        if (!e.solid || added >= 14) continue;
        minimap.push({
          x: Math.round(e.pos.x * 2) / 2,
          z: Math.round(e.pos.z * 2) / 2,
          k: e.elite ? 't' : 'e',
        });
        added += 1;
      }
      for (const c of this.crates) {
        minimap.push({
          x: Math.round(c.pos.x * 2) / 2,
          z: Math.round(c.pos.z * 2) / 2,
          k: 'c',
        });
      }
    }
    const tuning = {} as Record<WeaponId, number>;
    for (const id of WEAPON_ORDER) tuning[id] = p?.tuning[id] ?? 0;
    const dashCdMax = p ? p.effects.dashCd : 0;
    const dashReady = !p || dashCdMax <= 0
      ? 0
      : p.dashCd <= 0
        ? 1
        : 1 - p.dashCd / dashCdMax;
    return {
      phase: this.phase,
      run: this.run,
      hp: p ? Math.ceil(p.hp) : PLAYER.maxHp,
      maxHp: p ? p.maxHp : PLAYER.maxHp,
      armor: p ? Math.ceil(p.armor) : 0,
      armorMax: p ? p.armorMax : PLAYER.armorMax,
      weapon: p ? p.weapon : 'pistol',
      ammo: p ? p.mags[p.weapon] : 0,
      magSize: p ? p.spec.mag : WEAPONS.pistol.mag,
      reserve: p ? p.reserveCur : 0,
      reloading: p ? p.reloading : false,
      reloadProgress: p && p.reloading && p.reloadDur > 0 ? Math.min(1, p.reloadT / p.reloadDur) : 0,
      grenades: p ? p.grenades : 0,
      medkits: p ? p.medkits : 0,
      money: this.money,
      parts: this.parts,
      wave: Math.max(1, this.phase === 'menu' ? 0 : this.wave),
      intermissionT: this.run === 'skirmish' && this.phase === 'playing' ? Math.max(0, this.intermissionT) : 0,
      enemiesLeft: this.spawnQueue.length + this.enemies.filter((e) => e.solid).length,
      score: this.score,
      kills: this.kills,
      level: lv.level,
      xpInto: lv.into,
      xpNeed: lv.need,
      perkPoints: perkPointsAvailable(this.meta),
      shopOpen: this.shopOpen,
      dashReady,
      owned: p ? [...p.owned] : ['pistol'],
      tuning,
      minimap,
      px: p ? p.pos.x : BASE_POS.x,
      pz: p ? p.pos.z : BASE_POS.z,
      pyaw: p ? p.yaw : Math.PI,
    };
  }

  private clearRunEntities(): void {
    for (const e of this.enemies) e.dispose();
    this.enemies = [];
    for (const c of this.crates) {
      this.world.scene.remove(c.view.group);
      c.view.dispose();
    }
    this.crates = [];
    for (const g of this.grenades) this.world.scene.remove(g.mesh);
    this.grenades = [];
    for (const s of this.spits) this.world.scene.remove(s.mesh);
    this.spits = [];
    this.decals.clear();
    this.spawnQueue = [];
    this.shopOpen = false;
    if (this.viewRig) {
      this.camera.remove(this.viewRig.root);
      disposeViewRig(this.viewRig);
      this.viewRig = null;
    }
    this.player = null;
  }
}



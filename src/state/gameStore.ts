import { create } from 'zustand';
import type { BattleUnitInput } from '../game/battle';
import { simulateBattle } from '../game/battle';
import {
  ADS_PER_DAY, DAILY_LOGIN_REWARDS, ECHO_BUFFS, FORGE_COST_SOULS, LABYRINTH_FLOORS, LABYRINTH_MODS,
  LABYRINTH_UNLOCK_STAGE, OFFLINE_CAP_HOURS, RANK_ORDER, RANK_UP_COST, SOUL_CAP,
} from '../game/constants';
import { createRateState, DEV_CONFIG, PROD_CONFIG, validateCode, type CodeRateState } from '../game/codes';
import { diaryAuras, DIARY } from '../game/diary';
import { rollForge, salvageSouls } from '../game/forge';
import {
  summonOne, summonTen, ORDINARY_COST_GOLD, ORDINARY_COST_SCROLLS,
  PREMIUM_10_COST_CRYSTALS, PREMIUM_COST_CRYSTALS,
} from '../game/gacha';
import { computeAuras } from '../game/auras';
import { FIVE_STARS, getHeroDef, STARTER_HERO_ID } from '../game/heroes';
import { SHOP_PACKS, type AdRewardKind } from '../game/monetization';
import { computeOffline, type OfflineReward } from '../game/offline';
import { dayKey, questDef, rollDailies, rollWeeklies, weekKey } from '../game/quests';
import { seedFromTime } from '../game/rng';
import { buildStage, buildTowerFloor, idleRatesPerHour, mirrorUnits, stageToUnits, type StageDef } from '../game/stages';
import { computeStats, levelUpCost, maxLevelForRank, powerOf } from '../game/stats';
import type {
  AuraInfo, BattleModifiers, BattleResult, BuffKind, EquipItem, EquipSlot,
  GameState, HeroState, QuestState, Rank, RewardBundle,
} from '../game/types';
import { track, trackOnce } from '../platform/analytics';
import { haptic, isDevMode, getTelegramUserId } from '../platform/telegram';
import { playSfx, setMuted } from '../platform/audio';
import { createInitialGameState } from './initialState';
import { loadSave, persistSave, clearSave } from './save';

/* ------------------------------- UI types ------------------------------- */

export type ScreenId =
  | 'home' | 'battle' | 'heroes' | 'squad' | 'summon' | 'more' | 'tower'
  | 'labyrinth' | 'forge' | 'echo' | 'diary' | 'quests' | 'leaderboard' | 'shop' | 'settings';

export type BattleMode = 'campaign' | 'tower' | 'labyrinth';

export interface ActiveBattle {
  result: BattleResult;
  mode: BattleMode;
  stageDef: StageDef;
  startedAt: number;
  speed: number;
  finished: boolean;
  /** rewards actually granted (first clear vs repeat) — shown on the victory panel */
  granted: RewardBundle | null;
}

export type ModalId =
  | 'offline' | 'dailyLogin' | 'summonResult' | 'codeResult' | 'ascension'
  | 'defeatReport' | 'adPlayer' | 'rateInfo' | 'adminLog' | null;

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'reward' | 'error';
}

interface UiSlice {
  booted: boolean;
  screen: ScreenId;
  prevScreen: ScreenId;
  battle: ActiveBattle | null;
  ftuePause: boolean;
  modal: ModalId;
  toasts: Toast[];
  defeatTips: string[];
  offlineReward: OfflineReward | null;
  summonResults: { heroId: string; rarity: number; isDuplicate: boolean; isFodder: boolean }[] | null;
  lastCodeResult: { ok: boolean; label: string } | null;
  codeRate: CodeRateState;
  adKind: AdRewardKind | null;
  fps: number;
}

interface Actions {
  boot: () => void;
  setScreen: (s: ScreenId) => void;
  toast: (text: string, kind?: Toast['kind']) => void;
  dismissToast: (id: number) => void;
  save: () => void;

  addResources: (r: Partial<GameState['resources']>, opts?: { capSouls?: boolean }) => void;

  /* battles */
  startBattle: (mode: BattleMode) => void;
  setBattleSpeed: (s: number) => void;
  resumeFromFtuePause: () => void;
  finishBattle: () => void;
  skipBattle: (via: 'crystals' | 'ad') => void;

  /* heroes */
  levelUpHero: (uid: string, times?: number) => void;
  rankUpHero: (uid: string) => void;
  setSlot: (slot: number, uid: string | null) => void;
  swapSlots: (a: number, b: number) => void;
  equipItem: (uid: string, item: EquipItem) => void;
  unequipItem: (uid: string, slot: EquipSlot) => void;

  /* forge (14.2) */
  forgeItem: (slot: EquipSlot) => void;
  salvageItem: (itemUid: string, from: 'inventory' | 'hero', heroUid?: string) => void;

  /* echo (14.1) */
  activateEchoBuff: (kind: BuffKind) => void;

  /* pact (14.4) */
  activatePact: (slot: number) => void;
  removePactForCrystals: () => void;

  /* summon */
  doSummon: (banner: 'ordinary' | 'premium', count: 1 | 10, payWith: 'scrolls' | 'gold' | 'crystals') => void;
  closeSummonResults: () => void;

  /* meta */
  claimDailyLogin: () => void;
  claimQuest: (list: 'daily' | 'weekly', id: string) => void;
  collectOffline: (multiplier: number) => void;
  watchAd: (kind: AdRewardKind) => void;
  completeAd: () => void;
  buyPack: (packId: string) => void;
  ascend: () => void;
  canAscend: () => boolean;

  /* codes (§15) */
  submitCode: (raw: string) => void;
  confirmResetSave: () => void;

  /* ftue & settings */
  ftueAdvance: () => void;
  toggleMute: () => void;
  setTheme: (t: 'dark' | 'light') => void;
  setDevFlag: (f: 'fps' | 'hitboxes', v: boolean) => void;
  devFastForward: (seconds: number) => void;
  devClearCache: () => void;

  /* derived */
  resetGame: () => void;
}

export type GameStore = { game: GameState } & UiSlice & Actions;

/* ------------------------------ helpers ------------------------------ */

let uidSeq = 0;
function newUid(prefix: string): string {
  uidSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${uidSeq}`;
}

let toastSeq = 0;

function grantHero(state: GameState, defId: string): GameState {
  const existing = Object.values(state.heroes).find((h) => h.defId === defId);
  if (existing) {
    return {
      ...state,
      heroes: { ...state.heroes, [existing.uid]: { ...existing, copies: existing.copies + 1 } },
    };
  }
  const uid = newUid('h');
  const hero: HeroState = { uid, defId, level: 1, rank: 5, copies: 0, equip: {}, pactHpBattles: 0, pactSilenceBattles: 0 };
  const team = [...state.team];
  const empty = team.indexOf(null);
  if (empty !== -1) team[empty] = uid;
  return { ...state, heroes: { ...state.heroes, [uid]: hero }, team };
}

function applyReward(state: GameState, r: RewardBundle): GameState {
  const res = { ...state.resources };
  if (r.gold) res.gold += r.gold;
  if (r.heroExp) res.heroExp += r.heroExp;
  if (r.crystals) res.crystals += r.crystals;
  if (r.shards) res.shards += r.shards;
  if (r.souls) res.souls = Math.min(SOUL_CAP, res.souls + r.souls);
  if (r.scrolls) res.scrolls += r.scrolls;
  if (r.fodder) res.fodder += r.fodder;
  let s: GameState = { ...state, resources: res };
  if (r.heroDefId) s = grantHero(s, r.heroDefId);
  return s;
}

function bumpQuests(quests: GameState['quests'], metric: string, amount: number): GameState['quests'] {
  const bump = (list: QuestState[]): QuestState[] =>
    list.map((q) => {
      const def = questDef(q.id);
      if (def?.metric !== metric || q.claimed) return q;
      return { ...q, progress: Math.min(q.target, q.progress + amount) };
    });
  return { ...quests, daily: bump(quests.daily), weekly: bump(quests.weekly) };
}

function hasLegendary(state: GameState): boolean {
  return (
    state.inventory.some((i) => i.rarity === 'legendary') ||
    Object.values(state.heroes).some((h) => Object.values(h.equip).some((e) => e.rarity === 'legendary'))
  );
}

function checkDiary(state: GameState): GameState {
  const unlocked = new Set(state.diary);
  let changed = false;
  const bestRankIdx = Math.max(0, ...Object.values(state.heroes).map((h) => RANK_ORDER.indexOf(h.rank)));
  const bestRank = RANK_ORDER[bestRankIdx] ?? 5;

  for (const entry of DIARY) {
    if (unlocked.has(entry.id)) continue;
    const u = entry.unlock;
    let ok = false;
    if (u.kind === 'stage') ok = state.campaign.maxStage >= u.value;
    else if (u.kind === 'tower') ok = state.tower.bestFloor >= u.value;
    else if (u.kind === 'labyrinth') ok = state.labyrinth.completedWeeks >= 1;
    else if (u.kind === 'summons') ok = state.stats.summons >= u.value;
    else if (u.kind === 'ascension') ok = state.prestige.ascensions >= u.value;
    else if (u.kind === 'rank') ok = RANK_ORDER.indexOf(bestRank) >= RANK_ORDER.indexOf(u.value as Rank);
    else ok = hasLegendary(state); // forgeLegendary
    if (ok) {
      unlocked.add(entry.id);
      changed = true;
      track('diary_unlock', { id: entry.id });
    }
  }
  if (!changed) return state;
  return { ...state, diary: [...unlocked] };
}

function rotateQuestsIfNeeded(state: GameState, now = new Date()): GameState {
  let s = state;
  if (s.quests.dailyDate !== dayKey(now)) {
    s = { ...s, quests: { ...s.quests, daily: rollDailies(dayKey(now)), dailyDate: dayKey(now) } };
  }
  if (s.quests.weeklyKey !== weekKey(now)) {
    s = { ...s, quests: { ...s.quests, weekly: rollWeeklies(weekKey(now)), weeklyKey: weekKey(now) } };
  }
  if (s.adsToday.date !== dayKey(now)) {
    s = { ...s, adsToday: { date: dayKey(now), count: 0 } };
  }
  return s;
}

function decrementBuffs(state: GameState): GameState {
  const echo = state.echo.buff;
  let next: GameState = state;
  if (echo) {
    const left = echo.battlesLeft - 1;
    next = { ...next, echo: { ...next.echo, buff: left > 0 ? { ...echo, battlesLeft: left } : null } };
  }
  const heroes: Record<string, HeroState> = {};
  for (const [uid, h] of Object.entries(next.heroes)) {
    heroes[uid] = {
      ...h,
      pactHpBattles: Math.max(0, h.pactHpBattles - 1),
      pactSilenceBattles: Math.max(0, h.pactSilenceBattles - 1),
    };
  }
  return { ...next, heroes, pact: { slot: null } };
}

function defeatTips(result: BattleResult, game: GameState): string[] {
  const tips: string[] = [];
  const front = game.team.slice(0, 2).map((uid) => (uid ? game.heroes[uid] : undefined));
  const frontTanky = front.some((h) => h && getHeroDef(h.defId).role === 'tank');
  if (!frontTanky) tips.push('Поставь танка вперёд — передний ряд принимает основной урон');
  else tips.push('Попробуй другую фракцию: ауры меняют исход боя');
  if (game.echo.buff === null && game.resources.souls >= 3) {
    tips.push('Активируй бафф «Эха павших» — поражение принесло осколки душ');
  }
  if (result.rounds >= 20) tips.push('Бой затянулся — не хватает урона: скуй оружие в Кузнице душ');
  return tips.slice(0, 3);
}

export function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}K`;
  return Math.round(n).toLocaleString('ru-RU');
}

export function heroPower(h: HeroState, auras: AuraInfo[] = []): number {
  return powerOf(computeStats(h, { auras }));
}

/* ------------------------------- the store ------------------------------- */

export const useGameStore = create<GameStore>()((set, get) => ({
  booted: false,
  screen: 'home',
  prevScreen: 'home',
  battle: null,
  ftuePause: false,
  modal: null,
  toasts: [],
  defeatTips: [],
  offlineReward: null,
  summonResults: null,
  lastCodeResult: null,
  codeRate: createRateState(),
  adKind: null,
  fps: 0,
  game: createInitialGameState(),

  boot: () => {
    const loaded = loadSave();
    let game = loaded ?? createInitialGameState();
    game = rotateQuestsIfNeeded(game);
    const offline = loaded ? computeOffline(game, Date.now()) : null;
    set({
      game,
      booted: true,
      offlineReward: offline,
      modal: offline ? 'offline' : null,
    });
    setMuted(game.settings.muted);
    track('boot_done', { fresh: !loaded, stage: game.campaign.stage });
    get().save();
  },

  setScreen: (s) => {
    const cur = get().screen;
    playSfx('tap');
    haptic('light');
    track('screen_view', { screen: s });
    set({ screen: s, prevScreen: cur });
  },

  toast: (text, kind = 'info') => {
    toastSeq += 1;
    const id = toastSeq;
    set((st) => ({ toasts: [...st.toasts, { id, text, kind }] }));
    window.setTimeout(() => { get().dismissToast(id); }, 2800);
  },

  dismissToast: (id) => { set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })); },

  save: () => { persistSave(get().game); },

  addResources: (r, opts) => { set((st) => {
      const res = { ...st.game.resources };
      if (r.gold) res.gold += r.gold;
      if (r.heroExp) res.heroExp += r.heroExp;
      if (r.crystals) res.crystals += r.crystals;
      if (r.shards) res.shards += r.shards;
      if (r.souls) res.souls = opts?.capSouls === false ? res.souls + r.souls : Math.min(SOUL_CAP, res.souls + r.souls);
      if (r.scrolls) res.scrolls += r.scrolls;
      if (r.fodder) res.fodder += r.fodder;
      return { game: { ...st.game, resources: res } };
    }); },

  /* -------------------------------- battles -------------------------------- */

  startBattle: (mode) => {
    const st = get();
    const game = st.game;
    if (st.battle && !st.battle.finished) return;

    const heroes = game.team
      .map((uid) => (uid ? game.heroes[uid] : undefined))
      .filter((h): h is HeroState => Boolean(h));
    if (heroes.length === 0) {
      st.toast('Состав пуст — добавьте героев', 'error');
      return;
    }

    const auras = [...computeAuras(heroes.map((h) => getHeroDef(h.defId))), ...diaryAuras(game.diary)];
    const echoBuff = game.echo.buff?.kind ?? null;
    const mods: BattleModifiers = {
      echoBuff,
      pactSlot: game.pact.slot,
      forceResult: game.forcedNextResult,
      mirror: null,
    };

    let stageDef: StageDef;
    let enemyUnits: BattleUnitInput[];
    if (mode === 'campaign') {
      stageDef = buildStage(game.campaign.stage);
      enemyUnits = stageToUnits(stageDef);
    } else if (mode === 'tower') {
      stageDef = buildTowerFloor(game.tower.floor);
      enemyUnits = stageToUnits(stageDef);
    } else {
      const floor = game.labyrinth.floor;
      const mod = LABYRINTH_MODS[(floor - 1) % LABYRINTH_MODS.length];
      stageDef = {
        stage: floor,
        name: `Лабиринт отражений · этаж ${floor}`,
        boss: floor === LABYRINTH_FLOORS,
        enemies: [],
        firstReward: { souls: 2 + floor, shards: 10 * floor },
        repeatReward: {},
      };
      enemyUnits = mirrorUnits(game, floor);
      if (mod?.noHealers) {
        // «у врагов нет лекарей, но есть щиты»
        enemyUnits = enemyUnits
          .filter((u) => u.def.role !== 'healer')
          .map((u) => ({ ...u, specials: { ...u.specials, roundOneShield: true } }));
      }
      mods.mirror = { hpMult: mod?.hpMult, skillChanceMult: mod?.skillChanceMult, noHealers: mod?.noHealers };
    }

    const allyUnits: BattleUnitInput[] = heroes.map((h) => {
      // Echo-баффы применяет сама симуляция (BattleModifiers.echoBuff)
      let stats = computeStats(h, { auras });
      if (h.pactHpBattles > 0) stats = { ...stats, hp: Math.round(stats.hp * 0.8) };
      const specials: NonNullable<BattleUnitInput['specials']> = {};
      for (const item of Object.values(h.equip)) {
        if (!item.special) continue;
        if (item.special === 'firstStrikeCrit') specials.firstStrikeCrit = true;
        if (item.special === 'roundOneShield') specials.roundOneShield = true;
        if (item.special === 'executeLow') specials.executeLow = true;
        if (item.special === 'critChance5') stats = { ...stats, crit: Math.min(0.75, stats.crit + 0.05) };
      }
      return {
        def: getHeroDef(h.defId),
        stats,
        silenced: h.pactSilenceBattles > 0,
        specials,
        uid: h.uid,
        level: h.level,
        rank: String(h.rank),
      };
    });

    const ftueBattle = !game.ftue.done && (game.ftue.step === 1 || game.ftue.step === 3);
    // FTUE-бои всегда выигрываются (§9): обучение не должно ломаться рандомом
    // (явные dev/admin-команды force_win/force_lose имеют приоритет)
    if (ftueBattle && !mods.forceResult) mods.forceResult = 'win';
    const result = simulateBattle({ allies: allyUnits, enemies: enemyUnits, seed: seedFromTime(), modifiers: mods });

    track('battle_start', { mode, stage: stageDef.stage });
    set({
      screen: 'battle',
      battle: { result, mode, stageDef, startedAt: Date.now(), speed: 1, finished: false, granted: null },
      ftuePause: ftueBattle,
      defeatTips: [],
      game: { ...game, forcedNextResult: null },
    });
    get().save();
  },

  setBattleSpeed: (s) => { set((st) => (st.battle ? { battle: { ...st.battle, speed: s } } : {})); },

  resumeFromFtuePause: () => { set({ ftuePause: false }); },

  finishBattle: () => {
    const st = get();
    const battle = st.battle;
    if (!battle || battle.finished) return;
    let game: GameState = st.game;
    const { result, mode, stageDef } = battle;
    const pactSlot = game.pact.slot; // фиксируем ДО тика баффов
    let rewards: RewardBundle = {};
    let tips: string[] = [];
    let extraNote = '';

    if (result.victory) {
      game = {
        ...game,
        stats: { ...game.stats, battlesWon: game.stats.battlesWon + 1, kills: game.stats.kills + result.fallenEnemies },
      };
      if (mode === 'campaign') {
        const first = game.campaign.stage > game.campaign.maxStage;
        rewards = first ? stageDef.firstReward : stageDef.repeatReward;
        if (first) {
          game = { ...game, campaign: { stage: game.campaign.stage + 1, maxStage: game.campaign.stage } };
          trackOnce('first_stage_clear');
        }
        if (!game.labyrinth.unlocked && game.campaign.maxStage >= LABYRINTH_UNLOCK_STAGE) {
          game = { ...game, labyrinth: { ...game.labyrinth, unlocked: true } };
          extraNote = 'Открыт «Лабиринт отражений»!';
        }
      } else if (mode === 'tower') {
        const first = game.tower.floor > game.tower.bestFloor;
        rewards = first ? stageDef.firstReward : stageDef.repeatReward;
        if (first) game = { ...game, tower: { ...game.tower, floor: game.tower.floor + 1, bestFloor: game.tower.floor } };
      } else {
        rewards = stageDef.firstReward;
        if (game.labyrinth.floor >= LABYRINTH_FLOORS) {
          game = { ...game, labyrinth: { ...game.labyrinth, floor: 1, completedWeeks: game.labyrinth.completedWeeks + 1 } };
          rewards = { ...rewards, crystals: (rewards.crystals ?? 0) + 100, heroDefId: 'mara' };
          extraNote = 'Лабиринт пройден полностью! Награда: Мара + 100 💎';
        } else {
          game = { ...game, labyrinth: { ...game.labyrinth, floor: game.labyrinth.floor + 1 } };
        }
      }
      game = applyReward(game, rewards);
      game.quests = bumpQuests(game.quests, 'wins', 1);
      if (mode === 'tower') game.quests = bumpQuests(game.quests, 'tower', 1);
      if (mode === 'campaign') game.quests = bumpQuests(game.quests, 'campaign', 1);
      if (rewards.souls) game.quests = bumpQuests(game.quests, 'souls', rewards.souls);
      playSfx('victory');
      haptic('success');
      track('battle_win', { mode, stage: stageDef.stage });
    } else {
      game = { ...game, stats: { ...game.stats, battlesLost: game.stats.battlesLost + 1 } };
      // «Эхо павших» (14.1): 1–3 осколка в зависимости от числа павших героев
      const souls = Math.max(1, Math.min(3, result.fallenAllies));
      const gained = Math.min(souls, SOUL_CAP - game.resources.souls);
      game = {
        ...game,
        resources: { ...game.resources, souls: game.resources.souls + gained },
        echo: { ...game.echo, totalEarned: game.echo.totalEarned + gained },
      };
      if (gained > 0) game.quests = bumpQuests(game.quests, 'souls', gained);
      tips = defeatTips(result, game);
      playSfx('defeat');
      haptic('error');
      track('battle_lose', { mode, stage: stageDef.stage, fallen: result.fallenAllies });
    }

    game = decrementBuffs(game);

    // Shadow Pact aftermath (14.4): -20% HP на 3 боя ИЛИ молчание на 2 боя.
    // Дебафф применяется ПОСЛЕ тика баффов, чтобы жить заявленное число боёв.
    if (pactSlot !== null) {
      const uid = game.team[pactSlot];
      const hero = uid ? game.heroes[uid] : undefined;
      if (hero && uid) {
        const silence = Math.random() < 0.5;
        game = {
          ...game,
          heroes: {
            ...game.heroes,
            [uid]: silence ? { ...hero, pactSilenceBattles: 2 } : { ...hero, pactHpBattles: 3 },
          },
          pact: { slot: null },
        };
      }
    }
    game = { ...game, quests: bumpQuests(game.quests, 'battles', 1) };
    game = checkDiary(game);
    if (!game.ftue.done) trackOnce('first_battle');

    set({
      game,
      battle: { ...battle, finished: true, granted: result.victory ? rewards : null },
      defeatTips: tips,
      modal: result.victory ? null : 'defeatReport',
    });
    if (result.victory) {
      const parts = [
        rewards.gold ? `+${fmt(rewards.gold)} 🪙` : '',
        rewards.heroExp ? `+${fmt(rewards.heroExp)} опыта` : '',
        rewards.shards ? `+${rewards.shards} шардов` : '',
        rewards.crystals ? `+${rewards.crystals} 💎` : '',
      ].filter(Boolean);
      st.toast(`Победа! ${parts.join(' · ')}`, 'reward');
      if (extraNote) window.setTimeout(() => { get().toast(extraNote, 'reward'); }, 1200);
    }
    get().save();
  },

  skipBattle: (via) => {
    const st = get();
    const battle = st.battle;
    if (!battle || battle.finished) return;
    if (via === 'crystals') {
      if (st.game.resources.crystals < 10) {
        st.toast('Нужно 10 💎 для пропуска', 'error');
        return;
      }
      set((s) => ({ game: { ...s.game, resources: { ...s.game.resources, crystals: s.game.resources.crystals - 10 } } }));
      get().finishBattle();
      set({ screen: 'home', battle: null, ftuePause: false });
    } else {
      // награда начислится в completeAd после полного просмотра
      get().watchAd('skipBattle');
    }
  },

  /* --------------------------------- heroes --------------------------------- */

  levelUpHero: (uid, times = 1) => {
    const st = get();
    let game = st.game;
    let hero = game.heroes[uid];
    if (!hero) return;
    let levels = 0;
    for (let i = 0; i < times; i++) {
      const maxLvl = maxLevelForRank(String(hero.rank));
      if (hero.level >= maxLvl) break;
      const cost = levelUpCost(hero.level);
      if (game.resources.gold < cost.gold || game.resources.heroExp < cost.exp) break;
      hero = { ...hero, level: hero.level + 1 };
      game = {
        ...game,
        resources: { ...game.resources, gold: game.resources.gold - cost.gold, heroExp: game.resources.heroExp - cost.exp },
        heroes: { ...game.heroes, [uid]: hero },
      };
      levels++;
    }
    if (levels === 0) {
      const maxLvl = maxLevelForRank(String(hero.rank));
      st.toast(hero.level >= maxLvl ? `Ранг ${String(hero.rank)}: уровень максимален — повысьте звёзды` : 'Не хватает золота или опыта', 'error');
      return;
    }
    game = {
      ...game,
      quests: bumpQuests(game.quests, 'upgrades', levels),
      stats: { ...game.stats, upgrades: game.stats.upgrades + levels },
    };
    game = checkDiary(game);
    playSfx('levelup');
    haptic('medium');
    trackOnce('first_upgrade');
    track('hero_levelup', { levels });
    set({ game });
    get().save();
  },

  rankUpHero: (uid) => {
    const st = get();
    const game = st.game;
    const hero = game.heroes[uid];
    if (!hero) return;
    const idx = RANK_ORDER.indexOf(hero.rank);
    const nextRank = RANK_ORDER[idx + 1];
    if (!nextRank) {
      st.toast('Максимальный ранг достигнут', 'info');
      return;
    }
    const cost = RANK_UP_COST[String(nextRank)];
    if (!cost) return;
    if (hero.copies < cost.shards || game.resources.gold < cost.gold || game.resources.fodder < cost.fodder) {
      st.toast(`Нужно: ${cost.shards} копий · ${fmt(cost.gold)} 🪙${cost.fodder ? ` · ${cost.fodder} «еды»` : ''}`, 'error');
      return;
    }
    let next: GameState = {
      ...game,
      heroes: { ...game.heroes, [uid]: { ...hero, rank: nextRank, copies: hero.copies - cost.shards } },
      resources: { ...game.resources, gold: game.resources.gold - cost.gold, fodder: game.resources.fodder - cost.fodder },
    };
    next = checkDiary(next);
    playSfx('forge');
    haptic('success');
    track('hero_rankup', { rank: String(nextRank) });
    set({ game: next });
    st.toast(`Ранг повышен до ${String(nextRank)}!`, 'reward');
    get().save();
  },

  setSlot: (slot, uid) => {
    set((st) => {
      const team = [...st.game.team];
      if (uid !== null) {
        const existing = team.indexOf(uid);
        if (existing !== -1) team[existing] = null;
      }
      team[slot] = uid;
      return { game: { ...st.game, team } };
    });
    playSfx('tap');
    get().save();
  },

  swapSlots: (a, b) => {
    set((st) => {
      const team = [...st.game.team];
      const tmp = team[a] ?? null;
      team[a] = team[b] ?? null;
      team[b] = tmp;
      return { game: { ...st.game, team } };
    });
    playSfx('tap');
    get().save();
  },

  equipItem: (uid, item) => {
    set((st) => {
      const hero = st.game.heroes[uid];
      if (!hero) return {};
      const prev = hero.equip[item.slot];
      const inventory = st.game.inventory.filter((i) => i.uid !== item.uid);
      if (prev) inventory.push(prev);
      return {
        game: {
          ...st.game,
          inventory,
          heroes: { ...st.game.heroes, [uid]: { ...hero, equip: { ...hero.equip, [item.slot]: item } } },
        },
      };
    });
    playSfx('tap');
    get().save();
  },

  unequipItem: (uid, slot) => {
    set((st) => {
      const hero = st.game.heroes[uid];
      if (!hero) return {};
      const item = hero.equip[slot];
      if (!item) return {};
      const equip = Object.fromEntries(Object.entries(hero.equip).filter(([k]) => k !== slot)) as typeof hero.equip;
      return {
        game: { ...st.game, inventory: [...st.game.inventory, item], heroes: { ...st.game.heroes, [uid]: { ...hero, equip } } },
      };
    });
    get().save();
  },

  /* ------------------------------ forge (14.2) ------------------------------ */

  forgeItem: (slot) => {
    const st = get();
    const game = st.game;
    if (game.resources.souls < FORGE_COST_SOULS) {
      st.toast(`Нужно ${FORGE_COST_SOULS} осколков душ`, 'error');
      return;
    }
    const item = rollForge(slot, seedFromTime());
    let next: GameState = {
      ...game,
      resources: { ...game.resources, souls: game.resources.souls - FORGE_COST_SOULS },
      inventory: [...game.inventory, item],
      stats: { ...game.stats, forges: game.stats.forges + 1 },
    };
    next = { ...next, quests: bumpQuests(next.quests, 'forge', 1) };
    next = checkDiary(next);
    playSfx('forge');
    haptic('medium');
    track('forge_craft', { slot, rarity: item.rarity });
    set({ game: next });
    st.toast(`Выковано: ${item.name}`, item.rarity === 'legendary' ? 'reward' : 'info');
    get().save();
  },

  salvageItem: (itemUid, from, heroUid) => {
    const st = get();
    const game = st.game;
    let item: EquipItem | undefined;
    let next = game;
    if (from === 'inventory') {
      item = game.inventory.find((i) => i.uid === itemUid);
      next = { ...game, inventory: game.inventory.filter((i) => i.uid !== itemUid) };
    } else if (heroUid) {
      const hero = game.heroes[heroUid];
      if (!hero) return;
      for (const [slot, eq] of Object.entries(hero.equip)) {
        if (eq.uid === itemUid) {
          item = eq;
          const equip = Object.fromEntries(Object.entries(hero.equip).filter(([k]) => k !== slot)) as typeof hero.equip;
          next = { ...game, heroes: { ...game.heroes, [heroUid]: { ...hero, equip } } };
          break;
        }
      }
    }
    if (!item) return;
    const souls = salvageSouls(Math.random());
    next = { ...next, resources: { ...next.resources, souls: Math.min(SOUL_CAP, next.resources.souls + souls) } };
    playSfx('coins');
    st.toast(`Разобрано: +${souls} осколков душ`, 'reward');
    set({ game: next });
    get().save();
  },

  /* ------------------------------- echo (14.1) ------------------------------- */

  activateEchoBuff: (kind) => {
    const st = get();
    const def = ECHO_BUFFS.find((b) => b.kind === kind);
    if (!def) return;
    const game = st.game;
    if (game.resources.souls < def.cost) {
      st.toast(`Нужно ${def.cost} осколков душ`, 'error');
      return;
    }
    let next: GameState = {
      ...game,
      resources: { ...game.resources, souls: game.resources.souls - def.cost },
      echo: { ...game.echo, buff: { kind, battlesLeft: def.battles } },
    };
    next = { ...next, quests: bumpQuests(next.quests, 'echo', 1) };
    playSfx('cast');
    haptic('medium');
    track('echo_buff', { kind });
    set({ game: next });
    st.toast(`«${def.name}» активирован`, 'reward');
    get().save();
  },

  /* ------------------------------- pact (14.4) ------------------------------- */

  activatePact: (slot) => {
    const st = get();
    const game = st.game;
    const uid = game.team[slot];
    const hero = uid ? game.heroes[uid] : undefined;
    if (!hero) {
      st.toast('Слот пуст', 'error');
      return;
    }
    if (hero.pactHpBattles > 0 || hero.pactSilenceBattles > 0) {
      st.toast('Герой уже под дебаффом Пакта — так нельзя', 'error');
      return;
    }
    if (game.pact.slot !== null) {
      st.toast('Не больше одного Пакта за бой', 'error');
      return;
    }
    playSfx('cast');
    haptic('warning');
    track('pact_activate', { slot });
    set({ game: { ...game, pact: { slot } } });
    st.toast('Пакт с тенью: +30% урона в следующем бою. Цена — дебафф после боя.', 'reward');
    get().save();
  },

  removePactForCrystals: () => {
    const st = get();
    const game = st.game;
    const COST = 30;
    const heroes: Record<string, HeroState> = {};
    let any = false;
    for (const [uid, h] of Object.entries(game.heroes)) {
      if (h.pactHpBattles > 0 || h.pactSilenceBattles > 0) {
        heroes[uid] = { ...h, pactHpBattles: 0, pactSilenceBattles: 0 };
        any = true;
      } else heroes[uid] = h;
    }
    if (!any) {
      st.toast('Дебаффов Пакта нет', 'info');
      return;
    }
    if (game.resources.crystals < COST) {
      st.toast(`Нужно ${COST} 💎`, 'error');
      return;
    }
    set({ game: { ...game, heroes, resources: { ...game.resources, crystals: game.resources.crystals - COST } } });
    st.toast('Тень отступила: дебаффы Пакта сняты', 'reward');
    get().save();
  },

  /* -------------------------------- summon -------------------------------- */

  doSummon: (banner, count, payWith) => {
    const st = get();
    let game = st.game;
    const costs: { key: keyof GameState['resources']; amount: number }[] =
      banner === 'ordinary'
        ? payWith === 'scrolls'
          ? [{ key: 'scrolls', amount: ORDINARY_COST_SCROLLS * count }]
          : [{ key: 'gold', amount: ORDINARY_COST_GOLD * count }]
        : [{ key: 'crystals', amount: count === 1 ? PREMIUM_COST_CRYSTALS : PREMIUM_10_COST_CRYSTALS }];

    for (const c of costs) {
      if (game.resources[c.key] < c.amount) {
        st.toast('Недостаточно ресурсов для призыва', 'error');
        return;
      }
    }
    const res = { ...game.resources };
    for (const c of costs) res[c.key] -= c.amount;
    game = { ...game, resources: res };

    const owned = new Set(Object.values(game.heroes).map((h) => h.defId));
    const results: { heroId: string; rarity: number; isDuplicate: boolean; isFodder: boolean }[] = [];
    let pity = game.pity.premium;
    let shardsGained = 0;
    let fodderGained = 0;

    const process = (o: { heroId: string; rarity: number; isDuplicate: boolean; isFodder: boolean; duplicateShards: number }): void => {
      results.push({ heroId: o.heroId, rarity: o.rarity, isDuplicate: o.isDuplicate, isFodder: o.isFodder });
      if (o.isDuplicate) shardsGained += o.duplicateShards; // дубликаты → шарды автоматически
      else if (o.isFodder) fodderGained += 1; // 3★ — «еда»
      else game = grantHero(game, o.heroId);
    };

    if (count === 1) {
      const r = summonOne(banner, { ownedDefIds: owned, pity }, seedFromTime());
      pity = r.newPity;
      process(r.outcome);
    } else {
      const r = summonTen(banner, { ownedDefIds: owned, pity }, seedFromTime());
      pity = r.newPity;
      for (const o of r.outcomes) process(o);
    }

    game = {
      ...game,
      resources: { ...game.resources, shards: game.resources.shards + shardsGained, fodder: game.resources.fodder + fodderGained },
      pity: { premium: pity },
      stats: { ...game.stats, summons: game.stats.summons + count },
    };
    game = { ...game, quests: bumpQuests(game.quests, 'summons', count) };
    game = checkDiary(game);

    playSfx('summon');
    haptic('medium');
    trackOnce('first_summon');
    track('summon', { banner, count });
    set({ game, summonResults: results, modal: 'summonResult' });
    get().save();
  },

  closeSummonResults: () => { set({ summonResults: null, modal: null }); },

  /* ---------------------------------- meta ---------------------------------- */

  claimDailyLogin: () => {
    const st = get();
    const game = st.game;
    const today = dayKey();
    if (game.daily.lastClaimDate === today) {
      set({ modal: null });
      return;
    }
    const dayIdx = game.daily.streak % 7;
    const reward = DAILY_LOGIN_REWARDS[dayIdx];
    if (!reward) return;
    const next = applyReward(game, reward.reward);
    playSfx('coins');
    haptic('success');
    track('daily_login_claim', { day: dayIdx + 1 });
    set({
      game: { ...next, daily: { lastClaimDay: dayIdx + 1, streak: game.daily.streak + 1, lastClaimDate: today } },
      modal: null,
    });
    st.toast(`День ${dayIdx + 1}: ${reward.label}`, 'reward');
    get().save();
  },

  claimQuest: (list, id) => {
    const st = get();
    const game = st.game;
    const q = game.quests[list].find((x) => x.id === id);
    const def = questDef(id);
    if (!q || !def || q.claimed || q.progress < q.target) return;
    const next = applyReward(game, def.reward);
    const quests = {
      ...next.quests,
      [list]: next.quests[list].map((x) => (x.id === id ? { ...x, claimed: true } : x)),
    };
    playSfx('coins');
    haptic('success');
    set({ game: { ...next, quests } });
    st.toast(`Награда получена: ${def.rewardLabel}`, 'reward');
    get().save();
  },

  collectOffline: (multiplier) => {
    const st = get();
    const off = st.offlineReward;
    if (!off) {
      set({ modal: null, adKind: null });
      return;
    }
    const bundle: RewardBundle = {
      gold: Math.round(off.gold * multiplier),
      heroExp: Math.round(off.exp * multiplier),
      shards: Math.round(off.shards * multiplier),
      souls: off.souls,
    };
    const next = applyReward(st.game, bundle);
    playSfx('coins');
    haptic('success');
    track('offline_collect', { minutes: Math.round(off.seconds / 60), multiplier });
    set({ game: next, offlineReward: null, modal: null, adKind: null });
    st.toast(`Пока вас не было: +${fmt(bundle.gold ?? 0)} 🪙 · +${fmt(bundle.heroExp ?? 0)} опыта${bundle.shards ? ` · +${bundle.shards} шардов` : ''}`, 'reward');
    get().save();
  },

  watchAd: (kind) => {
    const st = get();
    if (st.game.adsToday.count >= ADS_PER_DAY) {
      st.toast('Лимит рекламы на сегодня: 5/5', 'error');
      return;
    }
    set({ adKind: kind, modal: 'adPlayer' });
  },

  completeAd: () => {
    // награда — только после полного просмотра (§10)
    const st = get();
    const kind = st.adKind;
    if (!kind) return;
    const game = st.game;
    if (game.adsToday.count >= ADS_PER_DAY) {
      set({ modal: null, adKind: null });
      return;
    }
    let next: GameState = {
      ...game,
      adsToday: { ...game.adsToday, count: game.adsToday.count + 1 },
      stats: { ...game.stats, adWatches: game.stats.adWatches + 1 },
    };
    if (kind === 'crystals50') {
      next = applyReward(next, { crystals: 50 });
      set({ modal: null, adKind: null, game: next });
      st.toast('+50 💎 за просмотр', 'reward');
    } else if (kind === 'offlineX2') {
      set({ game: next, adKind: null });
      get().collectOffline(2);
    } else {
      // skipBattle: досматриваем рекламу → мгновенный результат боя
      set({ modal: null, adKind: null, game: next });
      get().finishBattle();
      set({ screen: 'home', battle: null, ftuePause: false });
    }
    track('ad_complete', { kind });
    trackOnce('first_ad_watch');
    playSfx('coins');
    get().save();
  },

  buyPack: (packId) => {
    const st = get();
    const pack = SHOP_PACKS.find((p) => p.id === packId);
    if (!pack) return;
    if (pack.oneTime && st.game.stats.firstPayment) {
      st.toast('Стартовый набор можно купить только один раз', 'error');
      return;
    }
    // Prototype flow: mock Stars payment → server-side validation → grant (§10)
    const crystals = pack.crystals + (pack.bonusCrystals ?? 0);
    let next = applyReward(st.game, { crystals, ...(pack.extra ?? {}) });
    next = { ...next, stats: { ...next.stats, firstPayment: true } };
    playSfx('coins');
    haptic('success');
    track('purchase', { pack: packId, stars: pack.stars });
    trackOnce('first_payment');
    set({ game: next, modal: null });
    st.toast(`Оплата ${pack.stars} ⭐ подтверждена сервером: +${crystals} 💎`, 'reward');
    get().save();
  },

  canAscend: () => get().game.campaign.maxStage >= 40,

  ascend: () => {
    const st = get();
    const game = st.game;
    if (!get().canAscend()) {
      st.toast('Вознесение доступно с 40-го этапа кампании', 'error');
      return;
    }
    const bonus = 0.25 + game.campaign.maxStage * 0.005;
    const next: GameState = {
      ...game,
      campaign: { stage: 1, maxStage: 0 },
      tower: { ...game.tower, floor: 1 },
      resources: { ...game.resources, gold: 0, heroExp: 0 },
      prestige: { ascensions: game.prestige.ascensions + 1, multiplier: Number((game.prestige.multiplier + bonus).toFixed(2)) },
      echo: { ...game.echo, buff: null },
      pact: { slot: null },
    };
    const checked = checkDiary(next);
    playSfx('victory');
    haptic('success');
    track('ascension', { n: checked.prestige.ascensions });
    set({ game: checked, modal: null });
    st.toast(`Вознесение свершилось! Постоянный множитель дохода: x${checked.prestige.multiplier.toFixed(2)}`, 'reward');
    get().save();
  },

  /* -------------------------------- codes §15 -------------------------------- */

  submitCode: (raw) => {
    const st = get();
    const devMode = isDevMode();
    const config = devMode ? DEV_CONFIG : PROD_CONFIG;
    const { result, rate } = validateCode(raw, {
      config,
      account: { id: getTelegramUserId(), devMode },
      rate: st.codeRate,
      now: Date.now(),
      usedCodes: st.game.codes.used,
      onLog: (entry) => { track('code_log', { code: entry.code, ok: entry.ok, reason: entry.reason ?? '' }); },
    });
    track('code_submit', { ok: result.ok });
    set({ codeRate: rate });

    if (!result.ok) {
      playSfx('defeat');
      const normalized = raw.trim().toUpperCase();
      set((s) => ({
        game: {
          ...s.game,
          codes: { ...s.game.codes, history: [...s.game.codes.history, { code: normalized, ok: false, at: Date.now() }].slice(-30) },
        },
        lastCodeResult: { ok: false, label: result.reason },
        modal: 'codeResult',
      }));
      return;
    }

    const eff = result.effect;
    if (eff.kind === 'resetSave') {
      if (rate.pendingResetAt === null) {
        get().confirmResetSave();
      } else {
        set({ lastCodeResult: { ok: true, label: result.label }, modal: 'codeResult' });
      }
      return;
    }

    let game = st.game;
    let modal: ModalId = 'codeResult';
    const normalized = raw.trim().toUpperCase();
    const withHistory = (g: GameState): GameState => ({
      ...g,
      codes: {
        used: [...g.codes.used, normalized],
        history: [...g.codes.history, { code: normalized, ok: true, at: Date.now() }].slice(-30),
      },
    });
    if (eff.kind === 'reward') {
      game = applyReward(withHistory(game), eff.reward);
    } else if (eff.kind === 'admin') {
      game = applyAdminAction(withHistory(game), eff.action);
      if (eff.action === 'log') modal = 'adminLog';
    } else {
      applyDevCommand(eff.command, eff.arg, get);
    }
    playSfx('coins');
    haptic('success');
    set({ game, lastCodeResult: { ok: true, label: result.label }, modal });
    get().save();
  },

  confirmResetSave: () => {
    clearSave();
    const fresh = createInitialGameState();
    set({ game: fresh, battle: null, modal: null, screen: 'home', ftuePause: false });
    get().toast('Сейв сброшен', 'info');
  },

  /* ------------------------------ ftue/settings ------------------------------ */

  ftueAdvance: () => {
    set((st) => {
      const step = st.game.ftue.step + 1;
      const done = step >= 4;
      const game: GameState = { ...st.game, ftue: { step: done ? 4 : step, done } };
      if (done && !st.game.ftue.done) track('ftue_complete');
      return { game, modal: done && !st.game.ftue.done ? 'dailyLogin' : st.modal };
    });
    get().save();
  },

  toggleMute: () => {
    const muted = !get().game.settings.muted;
    set((st) => ({ game: { ...st.game, settings: { ...st.game.settings, muted } } }));
    setMuted(muted);
    get().save();
  },

  setTheme: (t) => {
    set((st) => ({ game: { ...st.game, settings: { ...st.game.settings, theme: t } } }));
    get().save();
  },

  setDevFlag: (f, v) => {
    set((st) => ({ game: { ...st.game, devFlags: { ...st.game.devFlags, [f]: v } } }));
  },

  devFastForward: (seconds) => {
    set((st) => ({ game: { ...st.game, lastSeen: st.game.lastSeen - seconds * 1000 } }));
    const off = computeOffline(get().game, Date.now());
    set({ offlineReward: off, modal: off ? 'offline' : null });
    get().toast(`Время промотано на ${Math.round(seconds / 3600)} ч — оффлайн-доход готов`, 'info');
  },

  devClearCache: () => {
    set({ toasts: [], summonResults: null, lastCodeResult: null });
    get().toast('Локальный кеш очищен (сейв не тронут)', 'info');
  },

  resetGame: () => {
    clearSave();
    set({ game: createInitialGameState(), battle: null, screen: 'home', modal: null, ftuePause: false });
  },
}));

/* ------------------------------ code effects ------------------------------ */

function applyAdminAction(game: GameState, action: string): GameState {
  switch (action) {
    case 'gold': return applyReward(game, { gold: 1_000_000 });
    case 'gems': return applyReward(game, { crystals: 10_000 });
    case 'exp': return applyReward(game, { heroExp: 500_000 });
    case 'shards': return applyReward(game, { shards: 500 });
    case 'summons': return applyReward(game, { scrolls: 100 });
    case 'souls': {
      // admin_souls_200 — рабочий инструмент: кап осколков обходится только админ-кодом
      const res = { ...game.resources, souls: game.resources.souls + 200 };
      return { ...game, resources: res };
    }
    case 'heroAll': {
      let g = game;
      for (const h of FIVE_STARS) g = grantHero(g, h.id);
      return g;
    }
    case 'heroMax': {
      const heroes: Record<string, HeroState> = {};
      for (const [uid, h] of Object.entries(game.heroes)) heroes[uid] = { ...h, level: maxLevelForRank(String(h.rank)) };
      return { ...game, heroes };
    }
    case 'starMax': {
      const heroes: Record<string, HeroState> = {};
      for (const [uid, h] of Object.entries(game.heroes)) {
        heroes[uid] = { ...h, rank: 'E5', level: Math.max(h.level, 60) };
      }
      // «если хватает еды — выдать и её»
      return { ...game, heroes, resources: { ...game.resources, fodder: game.resources.fodder + 50 } };
    }
    case 'unlockAll':
      return { ...game, labyrinth: { ...game.labyrinth, unlocked: true }, tower: { ...game.tower, floor: Math.max(1, game.tower.floor) } };
    case 'skipTutorial': {
      const withStarter = Object.values(game.heroes).some((h) => h.defId === STARTER_HERO_ID) ? game : grantHero(game, STARTER_HERO_ID);
      return { ...withStarter, ftue: { step: 4, done: true }, resources: { ...withStarter.resources, gold: 50_000, heroExp: 20_000, scrolls: 5 } };
    }
    case 'setStage50':
      return { ...game, campaign: { stage: 50, maxStage: Math.max(game.campaign.maxStage, 49) } };
    case 'offline12h': {
      const rates = idleRatesPerHour(game);
      return applyReward(game, { gold: rates.gold * OFFLINE_CAP_HOURS, heroExp: rates.exp * OFFLINE_CAP_HOURS, shards: 12 });
    }
    case 'forceWin':
      return { ...game, forcedNextResult: 'win' };
    case 'forceLose':
      return { ...game, forcedNextResult: 'lose' };
    case 'log':
      return game;
    default:
      return game;
  }
}

function applyDevCommand(command: string, arg: number | undefined, get: () => GameStore): void {
  switch (command) {
    case 'fps': {
      const cur = get().game.devFlags.fps;
      get().setDevFlag('fps', !cur);
      break;
    }
    case 'hitboxes': {
      const cur = get().game.devFlags.hitboxes;
      get().setDevFlag('hitboxes', !cur);
      break;
    }
    case 'fast_forward':
      get().devFastForward(arg ?? 3600);
      break;
    case 'clear_cache':
      get().devClearCache();
      break;
    default:
      get().toast(`Неизвестная dev-команда: ${command}`, 'error');
  }
}

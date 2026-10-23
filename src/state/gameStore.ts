import { create } from 'zustand';
import { setSoundEnabled } from '@/audio/sfx';
import { performSummonBatch, SINGLE_SUMMON_GEMS, TEN_SUMMON_GEMS } from '@/game/gacha';
import {
  computeFactionAura,
  computeHeroStats,
  EQUIP_TIERS,
  getAscendShardCost,
  getHeroTemplate,
  getLevelUpCost,
  getRelicUpgradeCost,
  QUEST_DEFINITIONS,
} from '@/game/heroes';
import { buildStageDefinition, buildTowerFloor } from '@/game/stages';
import type { EquipSlot, OwnedHero, RelicLevels, SummonResultItem } from '@/game/types';

export type AppTab = 'battle' | 'heroes' | 'summon' | 'squad' | 'quests';

const STORAGE_KEY = 'astral_legion_save_v1';
const FREE_SUMMON_COOLDOWN_MS = 4 * 60 * 60 * 1000;

export interface LootBurstEvent {
  readonly id: number;
  readonly kind: 'gold' | 'gems' | 'mixed';
  readonly label: string;
}

export interface PersistedData {
  gold: number;
  essence: number;
  gems: number;
  scrolls: number;
  relicStones: number;
  currentStage: number;
  maxStage: number;
  towerFloor: number;
  totalKills: number;
  totalSummons: number;
  pityCounter: number;
  lastIdleClaimAt: number;
  lastFreeSummonAt: number;
  quickRaidsUsed: number;
  ownedHeroes: Record<string, OwnedHero>;
  lineup: (string | null)[];
  relics: RelicLevels;
  claimedQuests: string[];
  battleSpeed: 1 | 2 | 3;
  autoUlt: boolean;
  autoAdvance: boolean;
  soundOn: boolean;
}

export interface GameState extends PersistedData {
  activeTab: AppTab;
  selectedHeroId: string;
  lootBurst: LootBurstEvent | null;
  offlineModalReward: { gold: number; essence: number; minutes: number } | null;

  setActiveTab: (tab: AppTab) => void;
  selectHero: (heroId: string) => void;
  setBattleSpeed: (speed: 1 | 2 | 3) => void;
  toggleAutoUlt: () => void;
  toggleAutoAdvance: () => void;
  toggleSound: () => void;

  recordKills: (count: number) => void;
  completeStageVictory: () => { gold: number; essence: number; gems: number; stones: number; stageCleared: number };
  setStage: (stageNumber: number) => void;

  getPendingIdleRewards: (now?: number) => { gold: number; essence: number; shards: number; seconds: number };
  claimIdleRewards: () => { gold: number; essence: number; shards: number } | null;
  performQuickRaid: () => { gold: number; essence: number; shards: number; heroName: string } | null;
  dismissOfflineModal: () => void;

  levelUpHero: (heroId: string, times?: number) => boolean;
  ascendHero: (heroId: string) => boolean;
  upgradeEquip: (heroId: string, slot: EquipSlot) => boolean;
  autoUpgradeHeroGear: (heroId: string) => number;

  setLineupSlot: (slotIndex: number, heroId: string | null) => void;
  autoBestLineup: () => void;
  upgradeRelic: (key: keyof RelicLevels) => boolean;

  canFreeSummon: (now?: number) => boolean;
  summonHeroes: (count: 1 | 10) => SummonResultItem[] | null;

  completeTowerVictory: () => { gems: number; gold: number; essence: number; stones: number };
  claimQuest: (questId: string) => boolean;
  resetSave: () => void;
}

function createInitialData(): PersistedData {
  const now = Date.now();
  return {
    gold: 2800,
    essence: 950,
    gems: 1650,
    scrolls: 4,
    relicStones: 3,
    currentStage: 1,
    maxStage: 1,
    towerFloor: 1,
    totalKills: 0,
    totalSummons: 0,
    pityCounter: 0,
    // Start chest with 12 minutes already accumulated so player can test AFK chest immediately!
    lastIdleClaimAt: now - 12 * 60 * 1000,
    lastFreeSummonAt: 0,
    quickRaidsUsed: 0,
    ownedHeroes: {
      ignis: {
        heroId: 'ignis',
        level: 3,
        stars: 2,
        shards: 10,
        equip: { weapon: 1, armor: 1, ring: 0, relic: 0 },
      },
      kai: {
        heroId: 'kai',
        level: 2,
        stars: 2,
        shards: 5,
        equip: { weapon: 1, armor: 0, ring: 0, relic: 0 },
      },
      lyra: {
        heroId: 'lyra',
        level: 2,
        stars: 1,
        shards: 10,
        equip: { weapon: 0, armor: 0, ring: 0, relic: 1 },
      },
    },
    lineup: ['ignis', null, 'kai', 'lyra', null],
    relics: {
      valor: 0,
      vitality: 0,
      precision: 0,
      wisdom: 0,
    },
    claimedQuests: [],
    battleSpeed: 1,
    autoUlt: true,
    autoAdvance: true,
    soundOn: true,
  };
}

function loadPersisted(): PersistedData {
  const base = createInitialData();
  if (typeof window === 'undefined') return base;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<PersistedData>;
    return {
      ...base,
      ...parsed,
      ownedHeroes: parsed.ownedHeroes ?? base.ownedHeroes,
      lineup: Array.isArray(parsed.lineup) && parsed.lineup.length === 5 ? parsed.lineup : base.lineup,
      relics: parsed.relics ?? base.relics,
      claimedQuests: Array.isArray(parsed.claimedQuests) ? parsed.claimedQuests : base.claimedQuests,
    };
  } catch {
    return base;
  }
}

function savePersisted(state: PersistedData): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: PersistedData = {
      gold: state.gold,
      essence: state.essence,
      gems: state.gems,
      scrolls: state.scrolls,
      relicStones: state.relicStones,
      currentStage: state.currentStage,
      maxStage: state.maxStage,
      towerFloor: state.towerFloor,
      totalKills: state.totalKills,
      totalSummons: state.totalSummons,
      pityCounter: state.pityCounter,
      lastIdleClaimAt: state.lastIdleClaimAt,
      lastFreeSummonAt: state.lastFreeSummonAt,
      quickRaidsUsed: state.quickRaidsUsed,
      ownedHeroes: state.ownedHeroes,
      lineup: state.lineup,
      relics: state.relics,
      claimedQuests: state.claimedQuests,
      battleSpeed: state.battleSpeed,
      autoUlt: state.autoUlt,
      autoAdvance: state.autoAdvance,
      soundOn: state.soundOn,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage quota or private mode fallback
  }
}

let burstSeq = 1;

export const useGameStore = create<GameState>((set, get) => {
  const initial = loadPersisted();
  setSoundEnabled(initial.soundOn);

  const initialStageDef = buildStageDefinition(initial.maxStage);
  const awayMs = Math.max(0, Date.now() - initial.lastIdleClaimAt);
  const awayMinutes = Math.min(720, Math.floor(awayMs / 60000));
  const initialOfflineModal =
    awayMinutes >= 30
      ? {
          gold: Math.round(initialStageDef.idleGoldPerMin * awayMinutes),
          essence: Math.round(initialStageDef.idleEssencePerMin * awayMinutes),
          minutes: awayMinutes,
        }
      : null;

  return {
    ...initial,
    activeTab: 'battle',
    selectedHeroId: 'ignis',
    lootBurst: null,
    offlineModalReward: initialOfflineModal,

    setActiveTab: (tab) => {
      set({ activeTab: tab });
    },

    selectHero: (heroId) => {
      set({ selectedHeroId: heroId });
    },

    setBattleSpeed: (speed) => {
      set((s) => {
        const next = { ...s, battleSpeed: speed };
        savePersisted(next);
        return { battleSpeed: speed };
      });
    },

    toggleAutoUlt: () => {
      set((s) => {
        const autoUlt = !s.autoUlt;
        savePersisted({ ...s, autoUlt });
        return { autoUlt };
      });
    },

    toggleAutoAdvance: () => {
      set((s) => {
        const autoAdvance = !s.autoAdvance;
        savePersisted({ ...s, autoAdvance });
        return { autoAdvance };
      });
    },

    toggleSound: () => {
      set((s) => {
        const soundOn = !s.soundOn;
        setSoundEnabled(soundOn);
        savePersisted({ ...s, soundOn });
        return { soundOn };
      });
    },

    recordKills: (count) => {
      if (count <= 0) return;
      set((s) => {
        const totalKills = s.totalKills + count;
        savePersisted({ ...s, totalKills });
        return { totalKills };
      });
    },

    completeStageVictory: () => {
      const s = get();
      const stageDef = buildStageDefinition(s.currentStage);
      const isFirstClear = s.currentStage >= s.maxStage;
      const goldGain = isFirstClear ? stageDef.goldReward : Math.round(stageDef.goldReward * 0.45);
      const essenceGain = isFirstClear ? stageDef.essenceReward : Math.round(stageDef.essenceReward * 0.45);
      const gemGain = isFirstClear ? stageDef.gemReward : 0;
      const stoneGain = isFirstClear ? stageDef.relicStoneReward : 0;

      const clearedStage = s.currentStage;
      const nextMaxStage = Math.max(s.maxStage, s.currentStage + 1);
      const nextCurrentStage = s.autoAdvance ? s.currentStage + 1 : s.currentStage;

      set((prev) => {
        const updated: GameState = {
          ...prev,
          gold: prev.gold + goldGain,
          essence: prev.essence + essenceGain,
          gems: prev.gems + gemGain,
          relicStones: prev.relicStones + stoneGain,
          maxStage: nextMaxStage,
          currentStage: nextCurrentStage,
        };
        savePersisted(updated);
        return {
          gold: updated.gold,
          essence: updated.essence,
          gems: updated.gems,
          relicStones: updated.relicStones,
          maxStage: nextMaxStage,
          currentStage: nextCurrentStage,
        };
      });

      return {
        gold: goldGain,
        essence: essenceGain,
        gems: gemGain,
        stones: stoneGain,
        stageCleared: clearedStage,
      };
    },

    setStage: (stageNumber) => {
      const s = get();
      const target = Math.max(1, Math.min(s.maxStage, Math.floor(stageNumber)));
      set((prev) => {
        savePersisted({ ...prev, currentStage: target });
        return { currentStage: target };
      });
    },

    getPendingIdleRewards: (now = Date.now()) => {
      const s = get();
      const stageDef = buildStageDefinition(s.maxStage);
      const elapsedSec = Math.min(12 * 3600, Math.max(0, Math.floor((now - s.lastIdleClaimAt) / 1000)));
      const minutes = elapsedSec / 60;
      const gold = Math.floor(stageDef.idleGoldPerMin * minutes);
      const essence = Math.floor(stageDef.idleEssencePerMin * minutes);
      const shards = Math.floor(minutes / 15);
      return { gold, essence, shards, seconds: elapsedSec };
    },

    claimIdleRewards: () => {
      const s = get();
      const now = Date.now();
      const pending = s.getPendingIdleRewards(now);
      if (pending.gold <= 0 && pending.essence <= 0) return null;

      const ownedIds = Object.keys(s.ownedHeroes);
      const nextOwned = { ...s.ownedHeroes };
      if (pending.shards > 0 && ownedIds.length > 0) {
        const chosenId = ownedIds[Math.floor(Math.random() * ownedIds.length)];
        if (chosenId && nextOwned[chosenId]) {
          nextOwned[chosenId] = {
            ...nextOwned[chosenId],
            shards: nextOwned[chosenId].shards + pending.shards,
          };
        }
      }

      burstSeq += 1;
      set((prev) => {
        const updated: GameState = {
          ...prev,
          gold: prev.gold + pending.gold,
          essence: prev.essence + pending.essence,
          ownedHeroes: nextOwned,
          lastIdleClaimAt: now,
          offlineModalReward: null,
          lootBurst: {
            id: burstSeq,
            kind: 'gold',
            label: `+${pending.gold} Золота · +${pending.essence} Эссенции`,
          },
        };
        savePersisted(updated);
        return {
          gold: updated.gold,
          essence: updated.essence,
          ownedHeroes: nextOwned,
          lastIdleClaimAt: now,
          offlineModalReward: null,
          lootBurst: updated.lootBurst,
        };
      });

      return { gold: pending.gold, essence: pending.essence, shards: pending.shards };
    },

    performQuickRaid: () => {
      const s = get();
      const costGems = s.quickRaidsUsed === 0 ? 0 : 50;
      if (s.gems < costGems) return null;

      const stageDef = buildStageDefinition(s.maxStage);
      const gold = stageDef.idleGoldPerMin * 120;
      const essence = stageDef.idleEssencePerMin * 120;
      const shards = 10;

      const ownedIds = Object.keys(s.ownedHeroes);
      const luckyId = ownedIds[Math.floor(Math.random() * ownedIds.length)] ?? 'ignis';
      const nextOwned = { ...s.ownedHeroes };
      if (nextOwned[luckyId]) {
        nextOwned[luckyId] = {
          ...nextOwned[luckyId],
          shards: nextOwned[luckyId].shards + shards,
        };
      }
      const heroName = getHeroTemplate(luckyId).name;

      burstSeq += 1;
      set((prev) => {
        const updated: GameState = {
          ...prev,
          gems: prev.gems - costGems,
          gold: prev.gold + gold,
          essence: prev.essence + essence,
          quickRaidsUsed: prev.quickRaidsUsed + 1,
          ownedHeroes: nextOwned,
          lootBurst: {
            id: burstSeq,
            kind: 'mixed',
            label: `Быстрый поход: +${gold} Золота, +${shards} осколков (${heroName})`,
          },
        };
        savePersisted(updated);
        return {
          gems: updated.gems,
          gold: updated.gold,
          essence: updated.essence,
          quickRaidsUsed: updated.quickRaidsUsed,
          ownedHeroes: nextOwned,
          lootBurst: updated.lootBurst,
        };
      });

      return { gold, essence, shards, heroName };
    },

    dismissOfflineModal: () => {
      get().claimIdleRewards();
      set({ offlineModalReward: null });
    },

    levelUpHero: (heroId, times = 1) => {
      const s = get();
      const hero = s.ownedHeroes[heroId];
      if (!hero) return false;

      let curLevel = hero.level;
      let goldLeft = s.gold;
      let essenceLeft = s.essence;
      let upgraded = 0;

      for (let i = 0; i < times; i += 1) {
        const cost = getLevelUpCost(curLevel);
        if (goldLeft < cost.gold || essenceLeft < cost.essence) break;
        goldLeft -= cost.gold;
        essenceLeft -= cost.essence;
        curLevel += 1;
        upgraded += 1;
      }

      if (upgraded === 0) return false;

      set((prev) => {
        const nextOwned = {
          ...prev.ownedHeroes,
          [heroId]: { ...hero, level: curLevel },
        };
        const updated: GameState = {
          ...prev,
          gold: goldLeft,
          essence: essenceLeft,
          ownedHeroes: nextOwned,
        };
        savePersisted(updated);
        return {
          gold: goldLeft,
          essence: essenceLeft,
          ownedHeroes: nextOwned,
        };
      });
      return true;
    },

    ascendHero: (heroId) => {
      const s = get();
      const hero = s.ownedHeroes[heroId];
      if (!hero || hero.stars >= 10) return false;
      const needed = getAscendShardCost(hero.stars);
      if (hero.shards < needed) return false;

      set((prev) => {
        const nextOwned = {
          ...prev.ownedHeroes,
          [heroId]: {
            ...hero,
            stars: hero.stars + 1,
            shards: hero.shards - needed,
          },
        };
        savePersisted({ ...prev, ownedHeroes: nextOwned });
        return { ownedHeroes: nextOwned };
      });
      return true;
    },

    upgradeEquip: (heroId, slot) => {
      const s = get();
      const hero = s.ownedHeroes[heroId];
      if (!hero) return false;
      const currentTier = hero.equip[slot];
      const nextTierMeta = EQUIP_TIERS[currentTier + 1];
      if (!nextTierMeta || s.gold < nextTierMeta.forgeCostGold) return false;

      set((prev) => {
        const nextOwned = {
          ...prev.ownedHeroes,
          [heroId]: {
            ...hero,
            equip: {
              ...hero.equip,
              [slot]: currentTier + 1,
            },
          },
        };
        const gold = prev.gold - nextTierMeta.forgeCostGold;
        savePersisted({ ...prev, gold, ownedHeroes: nextOwned });
        return { gold, ownedHeroes: nextOwned };
      });
      return true;
    },

    autoUpgradeHeroGear: (heroId) => {
      const slots: EquipSlot[] = ['weapon', 'armor', 'ring', 'relic'];
      let count = 0;
      for (const slot of slots) {
        if (get().upgradeEquip(heroId, slot)) {
          count += 1;
        }
      }
      return count;
    },

    setLineupSlot: (slotIndex, heroId) => {
      if (slotIndex < 0 || slotIndex >= 5) return;
      set((prev) => {
        const nextLineup = [...prev.lineup];
        if (heroId !== null) {
          for (let i = 0; i < nextLineup.length; i += 1) {
            if (nextLineup[i] === heroId) {
              nextLineup[i] = null;
            }
          }
        }
        nextLineup[slotIndex] = heroId;
        // Prevent completely empty squad
        if (!nextLineup.some((entry) => entry !== null)) {
          const fallback = Object.keys(prev.ownedHeroes)[0] ?? 'ignis';
          nextLineup[0] = fallback;
        }
        savePersisted({ ...prev, lineup: nextLineup });
        return { lineup: nextLineup };
      });
    },

    autoBestLineup: () => {
      const s = get();
      const aura = computeFactionAura(s.lineup);
      const ownedList = Object.values(s.ownedHeroes)
        .map((owned) => ({
          owned,
          tpl: getHeroTemplate(owned.heroId),
          power: computeHeroStats(owned, s.relics, aura).power,
        }))
        .sort((a, b) => b.power - a.power)
        .slice(0, 5);

      const frontCandidates = ownedList.filter(
        (item) => item.tpl.role === 'tank' || item.tpl.role === 'warrior',
      );
      const backCandidates = ownedList.filter(
        (item) => item.tpl.role !== 'tank' && item.tpl.role !== 'warrior',
      );

      const ordered = [...frontCandidates, ...backCandidates];
      const nextLineup: (string | null)[] = [null, null, null, null, null];
      for (let i = 0; i < ordered.length && i < 5; i += 1) {
        const item = ordered[i];
        if (item) nextLineup[i] = item.owned.heroId;
      }

      set((prev) => {
        savePersisted({ ...prev, lineup: nextLineup });
        return { lineup: nextLineup };
      });
    },

    upgradeRelic: (key) => {
      const s = get();
      const curLvl = s.relics[key];
      const cost = getRelicUpgradeCost(curLvl);
      if (s.relicStones < cost) return false;

      set((prev) => {
        const relics = { ...prev.relics, [key]: curLvl + 1 };
        const relicStones = prev.relicStones - cost;
        savePersisted({ ...prev, relics, relicStones });
        return { relics, relicStones };
      });
      return true;
    },

    canFreeSummon: (now = Date.now()) => {
      const s = get();
      return now - s.lastFreeSummonAt >= FREE_SUMMON_COOLDOWN_MS;
    },

    summonHeroes: (count) => {
      const s = get();
      const now = Date.now();
      const freeReady = count === 1 && s.canFreeSummon(now);

      let nextScrolls = s.scrolls;
      let nextGems = s.gems;
      let nextFreeAt = s.lastFreeSummonAt;

      if (freeReady) {
        nextFreeAt = now;
      } else if (s.scrolls >= count) {
        nextScrolls -= count;
      } else {
        const gemCost = count === 10 ? TEN_SUMMON_GEMS : SINGLE_SUMMON_GEMS;
        if (s.gems < gemCost) return null;
        nextGems -= gemCost;
      }

      const { nextOwned, nextPity, results } = performSummonBatch(count, s.ownedHeroes, s.pityCounter);

      // Auto-deploy newly obtained heroes into open formation slots!
      const nextLineup = [...s.lineup];
      for (const item of results) {
        if (item.isNew && !nextLineup.includes(item.heroId)) {
          const emptyIdx = nextLineup.findIndex((slot) => slot === null);
          if (emptyIdx !== -1) {
            nextLineup[emptyIdx] = item.heroId;
          }
        }
      }

      set((prev) => {
        const updated: GameState = {
          ...prev,
          scrolls: nextScrolls,
          gems: nextGems,
          lastFreeSummonAt: nextFreeAt,
          ownedHeroes: nextOwned,
          pityCounter: nextPity,
          totalSummons: prev.totalSummons + count,
          lineup: nextLineup,
        };
        savePersisted(updated);
        return {
          scrolls: nextScrolls,
          gems: nextGems,
          lastFreeSummonAt: nextFreeAt,
          ownedHeroes: nextOwned,
          pityCounter: nextPity,
          totalSummons: updated.totalSummons,
          lineup: nextLineup,
        };
      });

      return results;
    },

    completeTowerVictory: () => {
      const s = get();
      const floorDef = buildTowerFloor(s.towerFloor);
      burstSeq += 1;

      set((prev) => {
        const updated: GameState = {
          ...prev,
          gems: prev.gems + floorDef.rewardGems,
          gold: prev.gold + floorDef.rewardGold,
          essence: prev.essence + floorDef.rewardEssence,
          relicStones: prev.relicStones + floorDef.rewardRelicStones,
          towerFloor: prev.towerFloor + 1,
          lootBurst: {
            id: burstSeq,
            kind: 'gems',
            label: `Этаж ${floorDef.floor} взят! +${floorDef.rewardGems} Кристаллов`,
          },
        };
        savePersisted(updated);
        return {
          gems: updated.gems,
          gold: updated.gold,
          essence: updated.essence,
          relicStones: updated.relicStones,
          towerFloor: updated.towerFloor,
          lootBurst: updated.lootBurst,
        };
      });

      return {
        gems: floorDef.rewardGems,
        gold: floorDef.rewardGold,
        essence: floorDef.rewardEssence,
        stones: floorDef.rewardRelicStones,
      };
    },

    claimQuest: (questId) => {
      const s = get();
      if (s.claimedQuests.includes(questId)) return false;
      const quest = QUEST_DEFINITIONS.find((q) => q.id === questId);
      if (!quest) return false;

      const highestHeroLevel = Object.values(s.ownedHeroes).reduce(
        (max, h) => Math.max(max, h.level),
        1,
      );
      const statMap = {
        totalKills: s.totalKills,
        maxStage: s.maxStage,
        totalSummons: s.totalSummons,
        highestHeroLevel,
        towerFloor: s.towerFloor,
      };

      if (statMap[quest.statKey] < quest.target) return false;

      burstSeq += 1;
      set((prev) => {
        const claimedQuests = [...prev.claimedQuests, questId];
        const updated: GameState = {
          ...prev,
          gems: prev.gems + quest.rewardGems,
          gold: prev.gold + quest.rewardGold,
          scrolls: prev.scrolls + quest.rewardScrolls,
          claimedQuests,
          lootBurst: {
            id: burstSeq,
            kind: 'gems',
            label: `+${quest.rewardGems} Кристаллов · +${quest.rewardScrolls} Свитков`,
          },
        };
        savePersisted(updated);
        return {
          gems: updated.gems,
          gold: updated.gold,
          scrolls: updated.scrolls,
          claimedQuests,
          lootBurst: updated.lootBurst,
        };
      });
      return true;
    },

    resetSave: () => {
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {
          // Ignore storage error
        }
      }
      const fresh = createInitialData();
      set({
        ...fresh,
        activeTab: 'battle',
        selectedHeroId: 'ignis',
        lootBurst: null,
        offlineModalReward: null,
      });
    },
  };
});

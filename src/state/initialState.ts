import { SAVE_VERSION } from '../game/constants';
import { STARTER_HERO_ID } from '../game/heroes';
import { dayKey, rollDailies, rollWeeklies, weekKey } from '../game/quests';
import type { GameState, HeroState } from '../game/types';

export function createStarterHero(): HeroState {
  return {
    uid: 'starter-veles',
    defId: STARTER_HERO_ID,
    level: 1,
    rank: 5,
    copies: 0,
    equip: {},
    pactHpBattles: 0,
    pactSilenceBattles: 0,
  };
}

export function createInitialGameState(): GameState {
  const starter = createStarterHero();
  const now = new Date();
  return {
    saveVersion: SAVE_VERSION,
    resources: { gold: 6000, heroExp: 3000, crystals: 120, shards: 0, souls: 0, scrolls: 5, fodder: 0 },
    heroes: { [starter.uid]: starter },
    team: [starter.uid, null, null, null, null, null],
    campaign: { stage: 1, maxStage: 0 },
    tower: { floor: 1, bestFloor: 0, lastResetDay: dayKey(now) },
    labyrinth: { unlocked: false, floor: 1, weekKey: weekKey(now), completedWeeks: 0 },
    prestige: { ascensions: 0, multiplier: 1 },
    echo: { buff: null, totalEarned: 0 },
    pact: { slot: null },
    daily: { lastClaimDay: 0, streak: 0, lastClaimDate: '' },
    quests: { daily: rollDailies(dayKey(now)), weekly: rollWeeklies(weekKey(now)), dailyDate: dayKey(now), weeklyKey: weekKey(now) },
    diary: [],
    pity: { premium: 0 },
    settings: { muted: false, theme: 'dark' },
    stats: { battlesWon: 0, battlesLost: 0, kills: 0, summons: 0, upgrades: 0, forges: 0, adWatches: 0, firstPayment: false },
    adsToday: { date: dayKey(now), count: 0 },
    codes: { used: [], history: [] },
    ftue: { step: 0, done: false },
    goals: [],
    lastSeen: Date.now(),
    inventory: [],
    forcedNextResult: null,
    devFlags: { fps: false, hitboxes: false },
    createdAt: Date.now(),
  };
}

import { HERO_ROSTER, RARITY_META } from './heroes';
import type { HeroTemplate, OwnedHero, Rarity, SummonResultItem } from './types';

export const SUMMON_RATES: Record<Rarity, number> = {
  mythic: 0.05,
  legendary: 0.15,
  epic: 0.35,
  rare: 0.45,
};

export const SINGLE_SUMMON_GEMS = 150;
export const TEN_SUMMON_GEMS = 1200;

function pickRarity(
  pityCounter: number,
  guaranteedEpicOrHigher: boolean,
  rng: () => number,
): Rarity {
  if (pityCounter >= 29) {
    return rng() < 0.32 ? 'mythic' : 'legendary';
  }
  const roll = rng();
  if (roll < SUMMON_RATES.mythic) return 'mythic';
  if (roll < SUMMON_RATES.mythic + SUMMON_RATES.legendary) return 'legendary';
  if (guaranteedEpicOrHigher || roll < SUMMON_RATES.mythic + SUMMON_RATES.legendary + SUMMON_RATES.epic) {
    return 'epic';
  }
  return 'rare';
}

function pickHeroOfRarity(rarity: Rarity, rng: () => number): HeroTemplate {
  const matching = HERO_ROSTER.filter((h) => h.rarity === rarity);
  const pool = matching.length > 0 ? matching : HERO_ROSTER;
  const idx = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  const chosen = pool[idx] ?? HERO_ROSTER[0];
  if (!chosen) {
    throw new Error('Roster cannot be empty');
  }
  return chosen;
}

export function performSummonBatch(
  count: 1 | 10,
  currentOwned: Record<string, OwnedHero>,
  initialPity: number,
  rng: () => number = Math.random,
): {
  readonly nextOwned: Record<string, OwnedHero>;
  readonly nextPity: number;
  readonly results: SummonResultItem[];
} {
  const nextOwned: Record<string, OwnedHero> = { ...currentOwned };
  let pity = initialPity;
  const results: SummonResultItem[] = [];
  let gotEpicOrBetter = false;

  for (let i = 0; i < count; i += 1) {
    const forceEpic = count === 10 && i === 9 && !gotEpicOrBetter;
    const rarity = pickRarity(pity, forceEpic, rng);

    if (rarity === 'legendary' || rarity === 'mythic') {
      pity = 0;
    } else {
      pity += 1;
    }

    if (rarity !== 'rare') {
      gotEpicOrBetter = true;
    }

    const tpl = pickHeroOfRarity(rarity, rng);
    const meta = RARITY_META[tpl.rarity];
    const existing = nextOwned[tpl.id];

    if (!existing) {
      nextOwned[tpl.id] = {
        heroId: tpl.id,
        level: 1,
        stars: meta.baseStars,
        shards: 0,
        equip: { weapon: 0, armor: 0, ring: 0, relic: 0 },
      };
      results.push({
        heroId: tpl.id,
        isNew: true,
        shardsGranted: 0,
        rarity: tpl.rarity,
      });
    } else {
      nextOwned[tpl.id] = {
        ...existing,
        shards: existing.shards + meta.dupShards,
      };
      results.push({
        heroId: tpl.id,
        isNew: false,
        shardsGranted: meta.dupShards,
        rarity: tpl.rarity,
      });
    }
  }

  return { nextOwned, nextPity: pity, results };
}

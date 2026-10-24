import type { HEROES } from './heroes';
import { FOUR_STARS, FIVE_STARS, THREE_STARS } from './heroes';
import { createRng } from './rng';
import type { Rarity } from './types';

/**
 * Summon (§5): two banners.
 * - «Врата Эха» (ordinary): scrolls or gold; 3–5★, duplicates → shards/fodder.
 * - «Высший призыв» (premium): crystals; guaranteed 4★+, pity 5★ at 50.
 * Odds are public (shown behind the «i» button before summoning).
 */

export interface SummonOutcome {
  heroId: string;
  rarity: Rarity;
  /** duplicate converted value: shards granted instead of a new hero */
  duplicateShards: number;
  isDuplicate: boolean;
  /** 3★ duplicates become fodder («еда») */
  isFodder: boolean;
}

export const ORDINARY_RATES: { rarity: Rarity; p: number }[] = [
  { rarity: 5, p: 0.05 },
  { rarity: 4, p: 0.25 },
  { rarity: 3, p: 0.7 },
];

export const PREMIUM_RATES: { rarity: Rarity; p: number }[] = [
  { rarity: 5, p: 0.12 },
  { rarity: 4, p: 0.88 },
];

export const PREMIUM_PITY = 50; // «До гарантированного 5★: N призывов»
export const ORDINARY_COST_SCROLLS = 1;
export const ORDINARY_COST_GOLD = 4000;
export const PREMIUM_COST_CRYSTALS = 30;
export const PREMIUM_10_COST_CRYSTALS = 270; // 10-pull discount
export const DUPLICATE_SHARDS: Record<Rarity, number> = { 3: 2, 4: 8, 5: 30 };

function pickRarity(rates: { rarity: Rarity; p: number }[], roll: number): Rarity {
  let acc = 0;
  for (const r of rates) {
    acc += r.p;
    if (roll < acc) return r.rarity;
  }
  return rates[rates.length - 1]?.rarity ?? 3;
}

function poolFor(rarity: Rarity): typeof HEROES {
  if (rarity === 5) return FIVE_STARS;
  if (rarity === 4) return FOUR_STARS;
  return THREE_STARS;
}

export interface SummonContext {
  ownedDefIds: Set<string>;
  pity: number; // premium summons since last 5★
}

export function summonOne(kind: 'ordinary' | 'premium', ctx: SummonContext, seed: number): { outcome: SummonOutcome; newPity: number } {
  const rng = createRng(seed);
  let rarity: Rarity;
  let newPity = ctx.pity;

  if (kind === 'premium') {
    newPity = ctx.pity + 1;
    if (newPity >= PREMIUM_PITY) {
      rarity = 5; // guaranteed
      newPity = 0;
    } else {
      rarity = pickRarity(PREMIUM_RATES, rng.next());
      if (rarity === 5) newPity = 0;
    }
  } else {
    rarity = pickRarity(ORDINARY_RATES, rng.next());
  }

  const pool = poolFor(rarity);
  const hero = pool[rng.int(0, pool.length - 1)] ?? pool[0] ?? THREE_STARS[0];
  if (!hero) throw new Error('summon pool is empty');

  const isDuplicate = ctx.ownedDefIds.has(hero.id);
  const isFodder = rarity === 3;
  return {
    outcome: {
      heroId: hero.id,
      rarity,
      duplicateShards: DUPLICATE_SHARDS[rarity],
      isDuplicate,
      isFodder,
    },
    newPity: kind === 'premium' ? newPity : ctx.pity,
  };
}

export function summonTen(kind: 'ordinary' | 'premium', ctx: SummonContext, seed: number): { outcomes: SummonOutcome[]; newPity: number } {
  const outcomes: SummonOutcome[] = [];
  let pity = ctx.pity;
  const owned = new Set(ctx.ownedDefIds);
  for (let i = 0; i < 10; i++) {
    const r = summonOne(kind, { ownedDefIds: owned, pity }, seed + i * 7717);
    outcomes.push(r.outcome);
    pity = r.newPity;
    owned.add(r.outcome.heroId);
  }
  return { outcomes, newPity: pity };
}

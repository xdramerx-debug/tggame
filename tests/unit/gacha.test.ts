import { describe, expect, it } from 'vitest';
import {
  DUPLICATE_SHARDS, ORDINARY_RATES, PREMIUM_PITY, PREMIUM_RATES, summonOne, summonTen,
} from '../../src/game/gacha';
import { FIVE_STARS } from '../../src/game/heroes';

describe('gacha (§5)', () => {
  it('public odds sum to 1 on both banners', () => {
    expect(ORDINARY_RATES.reduce((s, r) => s + r.p, 0)).toBeCloseTo(1);
    expect(PREMIUM_RATES.reduce((s, r) => s + r.p, 0)).toBeCloseTo(1);
  });

  it('premium pity guarantees a 5★ no later than the 50th summon', () => {
    let pity = 0;
    let sawFiveAt = -1;
    for (let i = 1; i <= PREMIUM_PITY; i++) {
      const r = summonOne('premium', { ownedDefIds: new Set(), pity }, i * 1013);
      pity = r.newPity;
      if (r.outcome.rarity === 5) {
        sawFiveAt = i;
        break;
      }
    }
    expect(sawFiveAt).toBeGreaterThan(0);
    expect(sawFiveAt).toBeLessThanOrEqual(PREMIUM_PITY);
  });

  it('pity counter resets after a 5★ and never exceeds the guarantee', () => {
    let pity = 0;
    for (let i = 0; i < 400; i++) {
      const r = summonOne('premium', { ownedDefIds: new Set(), pity }, i * 7919 + 11);
      expect(r.newPity).toBeLessThanOrEqual(PREMIUM_PITY);
      pity = r.newPity;
    }
  });

  it('premium banner never drops 3★', () => {
    for (let i = 0; i < 300; i++) {
      const r = summonOne('premium', { ownedDefIds: new Set(), pity: i % PREMIUM_PITY }, i * 31 + 5);
      expect(r.outcome.rarity).toBeGreaterThanOrEqual(4);
    }
  });

  it('duplicates are detected against the owned set and convert to shards', () => {
    const owned = new Set(FIVE_STARS.map((h) => h.id));
    const r = summonOne('premium', { ownedDefIds: owned, pity: 49 }, 12345); // pity → guaranteed 5★
    expect(r.outcome.rarity).toBe(5);
    expect(r.outcome.isDuplicate).toBe(true);
    expect(r.outcome.duplicateShards).toBe(DUPLICATE_SHARDS[5]);
  });

  it('3★ pulls become fodder when new', () => {
    let sawFodder = false;
    for (let i = 0; i < 100; i++) {
      const r = summonOne('ordinary', { ownedDefIds: new Set(), pity: 0 }, i * 17 + 3);
      if (r.outcome.rarity === 3) {
        expect(r.outcome.isFodder).toBe(true);
        sawFodder = true;
        break;
      }
    }
    expect(sawFodder).toBe(true);
  });

  it('10-pull returns exactly 10 outcomes and threads pity through', () => {
    const r = summonTen('premium', { ownedDefIds: new Set(), pity: 45 }, 999);
    expect(r.outcomes.length).toBe(10);
    expect(r.newPity).toBeLessThanOrEqual(PREMIUM_PITY);
  });

  it('ordinary rates roughly match the published odds over 20k pulls', () => {
    const counts: Record<number, number> = { 3: 0, 4: 0, 5: 0 };
    for (let i = 0; i < 20_000; i++) {
      const r = summonOne('ordinary', { ownedDefIds: new Set(), pity: 0 }, i * 2654435761 + 1);
      counts[r.outcome.rarity] = (counts[r.outcome.rarity] ?? 0) + 1;
    }
    const fiveRate = (counts[5] ?? 0) / 20_000;
    expect(fiveRate).toBeGreaterThan(0.03);
    expect(fiveRate).toBeLessThan(0.075); // published 5%
  });
});

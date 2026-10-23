import { describe, expect, it } from 'vitest';
import { LevelTrack, LEVEL_CONFIG } from '@/game/player/LevelTrack';

/**
 * Run levels are the "you are getting stronger right now" axis, next to the
 * permanent ember upgrades. The curve is data, the rules are here: an XP curve
 * that pays for itself in one kill, or one that never levels, are both design
 * bugs that only show up after twenty minutes of play.
 */
describe('LevelTrack', () => {
  it('starts at level 1 with nothing banked', () => {
    const track = new LevelTrack();
    expect(track.level).toBe(1);
    expect(track.xpInLevel).toBe(0);
    expect(track.requirement).toBe(LEVEL_CONFIG.baseXp);
    expect(track.ratio).toBe(0);
    expect(track.bonuses().maxHp).toBe(0);
  });

  it('levels up once the requirement is met and keeps the remainder', () => {
    const track = new LevelTrack();
    const result = track.addXp(LEVEL_CONFIG.baseXp + 5);
    expect(result.leveledUp).toBe(true);
    expect(result.level).toBe(2);
    expect(track.xpInLevel).toBe(5);
    expect(result.gained).toBe(1);
  });

  it('can gain several levels from one payout (boss kill)', () => {
    const track = new LevelTrack();
    const result = track.addXp(LEVEL_CONFIG.baseXp * 3);
    expect(result.gained).toBeGreaterThanOrEqual(2);
    expect(track.level).toBeGreaterThanOrEqual(3);
  });

  it('grows the requirement monotonically', () => {
    const track = new LevelTrack();
    let previous = 0;
    for (let level = 1; level < LEVEL_CONFIG.maxLevel; level += 1) {
      const requirement = track.requirementFor(level);
      expect(requirement).toBeGreaterThan(previous);
      previous = requirement;
    }
    // The cap has no requirement: the bar stays full.
    expect(track.requirementFor(LEVEL_CONFIG.maxLevel)).toBe(0);
  });

  it('stops at the cap and reports a full bar', () => {
    const track = new LevelTrack();
    track.addXp(1_000_000);
    expect(track.level).toBe(LEVEL_CONFIG.maxLevel);
    expect(track.isMaxed).toBe(true);
    expect(track.ratio).toBe(0);
    expect(track.toNext).toBe(0);
    // Further XP is absorbed silently rather than levelling past the cap.
    expect(track.addXp(500).leveledUp).toBe(false);
    expect(track.level).toBe(LEVEL_CONFIG.maxLevel);
  });

  it('grants cumulative stat bonuses per level', () => {
    const track = new LevelTrack();
    track.addXp(LEVEL_CONFIG.baseXp);
    const first = track.bonuses();
    expect(first.maxHp).toBe(LEVEL_CONFIG.perLevel.maxHp);
    expect(first.damage).toBe(LEVEL_CONFIG.perLevel.damage);
    track.addXp(track.requirement);
    const second = track.bonuses();
    expect(second.maxHp).toBe(LEVEL_CONFIG.perLevel.maxHp * 2);
    expect(second.damage).toBe(LEVEL_CONFIG.perLevel.damage * 2);
  });

  it('ignores negative and fractional XP', () => {
    const track = new LevelTrack();
    track.addXp(-40);
    track.addXp(Number.NaN);
    expect(track.level).toBe(1);
    expect(track.xpInLevel).toBe(0);
    track.addXp(9.9);
    expect(track.xpInLevel).toBe(9);
  });

  it('resets to level 1 for a new run', () => {
    const track = new LevelTrack();
    track.addXp(LEVEL_CONFIG.baseXp * 2);
    track.reset();
    expect(track.level).toBe(1);
    expect(track.xpInLevel).toBe(0);
    expect(track.bonuses().damage).toBe(0);
  });

  it('reflects progress through the current level', () => {
    const track = new LevelTrack();
    track.addXp(LEVEL_CONFIG.baseXp / 2);
    expect(track.ratio).toBeCloseTo(0.5, 2);
    expect(track.toNext).toBe(LEVEL_CONFIG.baseXp / 2);
  });
});

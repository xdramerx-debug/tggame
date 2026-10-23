import { describe, expect, it } from 'vitest';
import { characterById, moveDuration, ROSTER } from '@/characters/roster';
import { METER_MAX, MIN_SEPARATION } from '@/fight/types';

describe('roster', () => {
  it('ships four freaks with distinct silhouettes', () => {
    expect(ROSTER).toHaveLength(4);
    const kinds = new Set(ROSTER.map((character) => character.model.kind));
    expect(kinds.size).toBe(4);
    const ids = new Set(ROSTER.map((character) => character.id));
    expect(ids.size).toBe(4);
  });

  it('keeps every move shippable: sane frame data and reach', () => {
    for (const character of ROSTER) {
      for (const move of Object.values(character.moves)) {
        expect(move.startup).toBeGreaterThan(0);
        expect(move.active).toBeGreaterThan(0);
        expect(move.recovery).toBeGreaterThan(0);
        expect(move.damage).toBeGreaterThan(0);
        expect(move.chip).toBeGreaterThan(0);
        expect(move.chip).toBeLessThan(1);
        expect(move.meterGain).toBeGreaterThanOrEqual(0);
        expect(move.range).toBeGreaterThan(MIN_SEPARATION);
        expect(moveDuration(move)).toBeLessThan(90);
      }
    }
  });

  it('charges a bar for specials and the full meter for supers', () => {
    for (const character of ROSTER) {
      expect(character.moves.special.cost).toBe(100);
      expect(character.moves.super.cost).toBe(METER_MAX);
      expect(character.moves.super.damage).toBeGreaterThan(character.moves.kick.damage);
      expect(character.moves.super.meterGain).toBe(0);
    }
  });

  it('gives every freak a fast poke and an anti-air option', () => {
    for (const character of ROSTER) {
      expect(character.moves.punch.startup).toBeLessThanOrEqual(8);
      expect(character.moves.punch.recovery).toBeLessThanOrEqual(14);
      expect(character.moves.airkick.active).toBeGreaterThan(0);
      expect(character.stats.maxHealth).toBeGreaterThan(700);
      expect(character.stats.walkSpeed).toBeGreaterThan(1);
      expect(character.stats.backSpeed).toBeLessThan(character.stats.walkSpeed);
    }
  });

  it('resolves characters by id and falls back safely', () => {
    expect(characterById('oko').name).toBe('ОКО');
    expect(characterById('nope').id).toBe(ROSTER[0]?.id);
  });
});

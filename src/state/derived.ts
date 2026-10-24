import { useMemo } from 'react';
import { computeAuras } from '../game/auras';
import { getHeroDef } from '../game/heroes';
import { diaryAuras } from '../game/diary';
import { teamPower } from '../game/stats';
import type { AuraInfo, GameState, HeroState } from '../game/types';
import { useGameStore } from './gameStore';

/**
 * Derived team data computed from the stable `game` reference via useMemo.
 * NEVER select freshly-computed values directly from the zustand store —
 * a new object identity per call makes useSyncExternalStore loop forever.
 */

export function teamHeroesOf(game: GameState): HeroState[] {
  return game.team
    .map((uid) => (uid ? game.heroes[uid] : undefined))
    .filter((h): h is HeroState => h !== undefined);
}

export function teamAurasOf(game: GameState): AuraInfo[] {
  const heroes = teamHeroesOf(game);
  return [...computeAuras(heroes.map((h) => getHeroDef(h.defId))), ...diaryAuras(game.diary)];
}

export function teamPowerOf(game: GameState): number {
  return teamPower(teamHeroesOf(game), teamAurasOf(game));
}

export function useDerived(): { game: GameState; heroes: HeroState[]; auras: AuraInfo[]; power: number } {
  const game = useGameStore((s) => s.game);
  return useMemo(
    () => ({ game, heroes: teamHeroesOf(game), auras: teamAurasOf(game), power: teamPowerOf(game) }),
    [game],
  );
}

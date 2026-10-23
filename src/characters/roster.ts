import type { CharacterDef, CharacterStats, MoveData, MoveSet } from '@/fight/types';

/**
 * The roster: four freaks of the pit, each with its own silhouette, range and
 * game plan. Balance lives here as data — no character-specific code anywhere
 * else in the simulation.
 */

type MoveOverrides = Partial<MoveData> & Pick<MoveData, 'id' | 'label'>;

/** Fills the shared defaults so the per-character data stays readable. */
function move(overrides: MoveOverrides): MoveData {
  return {
    startup: 8,
    active: 3,
    recovery: 12,
    damage: 60,
    chip: 0.1,
    hitstun: 16,
    blockstun: 11,
    knockback: 0.35,
    height: 'mid',
    range: 1.5,
    meterGain: 14,
    ...overrides,
  };
}

const PUNCH = (range: number, damage: number, meterGain: number): MoveData =>
  move({ id: 'punch', label: 'Тычок', startup: 6, active: 3, recovery: 10, damage, range, meterGain, knockback: 0.25, hitstun: 15 });

const KICK = (range: number, damage: number, speed: number): MoveData =>
  move({ id: 'kick', label: 'Пинок', startup: speed, active: 4, recovery: 17, damage, range, knockback: 0.55, hitstun: 21, meterGain: 18 });

const SWEEP = (range: number, damage: number): MoveData =>
  move({
    id: 'sweep',
    label: 'Подсечка',
    startup: 10,
    active: 3,
    recovery: 22,
    damage,
    range,
    height: 'low',
    knockdown: true,
    knockback: 0.7,
    hitstun: 26,
    meterGain: 16,
  });

const AIRKICK = (range: number, damage: number): MoveData =>
  move({
    id: 'airkick',
    label: 'Прыжковый удар',
    startup: 6,
    active: 8,
    recovery: 10,
    damage,
    range,
    knockback: 0.5,
    hitstun: 18,
    meterGain: 16,
  });

function moves(base: {
  punch: MoveData;
  kick: MoveData;
  sweep: MoveData;
  airkick: MoveData;
  special: MoveData;
  super: MoveData;
}): MoveSet {
  return {
    punch: base.punch,
    kick: base.kick,
    sweep: base.sweep,
    airkick: base.airkick,
    special: base.special,
    super: base.super,
  };
}

const stats = (partial: Partial<CharacterStats> & Pick<CharacterStats, 'walkSpeed' | 'maxHealth'>): CharacterStats => ({
  backSpeed: partial.walkSpeed * 0.78,
  jumpSpeed: 7.2,
  weight: 1,
  defense: 1,
  ...partial,
});

export const GRIZLO: CharacterDef = {
  id: 'grizlo',
  name: 'ГРЫЗЛО',
  title: 'Помойный боров',
  lore: 'Вырос в мусорном баке за бойней. Ест всё, что шевелится, и немного того, что нет.',
  stats: stats({ walkSpeed: 2.05, maxHealth: 1120, weight: 1.22, defense: 0.94, jumpSpeed: 6.6 }),
  palette: { skin: 0xb98a6a, accent: 0x7a8f3a, cloth: 0x3c3226, glow: 0xb6e04a },
  model: { kind: 'brute', height: 1.95, girth: 1.28 },
  power: 4,
  speed: 2,
  range: 3,
  moves: moves({
    punch: PUNCH(1.35, 62, 14),
    kick: KICK(1.8, 100, 12),
    sweep: SWEEP(1.65, 76),
    airkick: AIRKICK(1.7, 96),
    special: move({
      id: 'special',
      label: 'Кислотный плевок',
      startup: 17,
      active: 4,
      recovery: 20,
      damage: 68,
      range: 1.2,
      cost: 100,
      cooldown: 92,
      chip: 0.14,
      projectile: {
        speed: 8.4,
        damage: 68,
        radius: 0.3,
        lifetimeTicks: 130,
        height: 1.05,
        hitstun: 22,
        knockback: 0.75,
        kind: 'acid',
      },
      meterGain: 18,
    }),
    super: move({
      id: 'super',
      label: 'ЖОР',
      startup: 14,
      active: 26,
      recovery: 22,
      damage: 236,
      hits: 4,
      hitInterval: 6,
      range: 1.9,
      cost: 300,
      chip: 0.22,
      hitstun: 20,
      knockback: 0.9,
      launch: 0,
      armor: true,
      meterGain: 0,
    }),
  }),
};

export const SHVEYA: CharacterDef = {
  id: 'shveya',
  name: 'ШВЕЯ',
  title: 'Сшитая из семи',
  lore: 'Шесть рук, один шов и очень много вопросов к тому, кто её собрал.',
  stats: stats({ walkSpeed: 2.95, maxHealth: 900, weight: 0.86, defense: 1.08, jumpSpeed: 7.9 }),
  palette: { skin: 0xd8c3c9, accent: 0x8a2338, cloth: 0x2a1c2e, glow: 0xe86a8a },
  model: { kind: 'stitched', height: 1.78, girth: 0.86 },
  power: 3,
  speed: 5,
  range: 3,
  moves: moves({
    punch: PUNCH(1.55, 48, 13),
    kick: KICK(1.95, 88, 9),
    sweep: SWEEP(1.75, 64),
    airkick: AIRKICK(1.85, 84),
    special: move({
      id: 'special',
      label: 'Стежок',
      startup: 11,
      active: 5,
      recovery: 17,
      damage: 82,
      range: 1.95,
      advance: 2.6,
      cost: 100,
      cooldown: 76,
      knockback: 0.6,
      hitstun: 20,
      meterGain: 20,
    }),
    super: move({
      id: 'super',
      label: 'СТРОЧКА',
      startup: 12,
      active: 30,
      recovery: 20,
      damage: 250,
      hits: 6,
      hitInterval: 5,
      range: 2.1,
      advance: 2.2,
      cost: 300,
      chip: 0.2,
      hitstun: 18,
      knockback: 0.5,
      meterGain: 0,
    }),
  }),
};

export const OKO: CharacterDef = {
  id: 'oko',
  name: 'ОКО',
  title: 'Смотритель ямы',
  lore: 'Никто не знает, где у него спина. Зато все знают, что оно смотрит.',
  stats: stats({ walkSpeed: 2.35, maxHealth: 950, weight: 0.95, defense: 1, jumpSpeed: 7.4 }),
  palette: { skin: 0xcdd7d9, accent: 0x2f6d78, cloth: 0x1b2b30, glow: 0x6fe3ff },
  model: { kind: 'eye', height: 1.9, girth: 0.95 },
  power: 4,
  speed: 3,
  range: 5,
  moves: moves({
    punch: PUNCH(1.5, 52, 13),
    kick: KICK(1.85, 90, 11),
    sweep: SWEEP(1.7, 68),
    airkick: AIRKICK(1.8, 86),
    special: move({
      id: 'special',
      label: 'Моргание',
      startup: 9,
      active: 4,
      recovery: 15,
      damage: 70,
      range: 1.7,
      advance: 2.1,
      invulnerable: true,
      cost: 100,
      cooldown: 84,
      knockback: 0.7,
      hitstun: 20,
      meterGain: 20,
    }),
    super: move({
      id: 'super',
      label: 'ВЗГЛЯД БЕЗДНЫ',
      startup: 20,
      active: 4,
      recovery: 24,
      damage: 210,
      range: 1.4,
      cost: 300,
      chip: 0.2,
      meterGain: 0,
      projectile: {
        speed: 17,
        damage: 210,
        radius: 0.55,
        lifetimeTicks: 70,
        height: 1.2,
        hitstun: 30,
        knockback: 1.1,
        kind: 'beam',
      },
    }),
  }),
};

export const PECH: CharacterDef = {
  id: 'pech',
  name: 'ПЕЧЬ',
  title: 'Топка',
  lore: 'Его собрали из котельной, которую снесли вместе с кочегаром. Он всё ещё топит.',
  stats: stats({ walkSpeed: 1.86, maxHealth: 1220, weight: 1.35, defense: 0.9, jumpSpeed: 6.2 }),
  palette: { skin: 0x6a625c, accent: 0x8d2f1f, cloth: 0x1e1c1c, glow: 0xf0a13a },
  model: { kind: 'furnace', height: 2.02, girth: 1.3 },
  power: 5,
  speed: 1,
  range: 2,
  moves: moves({
    punch: PUNCH(1.3, 66, 14),
    kick: KICK(1.75, 108, 13),
    sweep: SWEEP(1.6, 80),
    airkick: AIRKICK(1.65, 100),
    special: move({
      id: 'special',
      label: 'Пламенный рык',
      startup: 15,
      active: 10,
      recovery: 22,
      damage: 92,
      hits: 2,
      hitInterval: 5,
      range: 2.45,
      armor: true,
      cost: 100,
      cooldown: 96,
      chip: 0.16,
      knockback: 0.6,
      hitstun: 19,
      meterGain: 20,
    }),
    super: move({
      id: 'super',
      label: 'ПЕРЕГРЕВ',
      startup: 16,
      active: 22,
      recovery: 24,
      damage: 268,
      hits: 3,
      hitInterval: 7,
      range: 2.6,
      cost: 300,
      armor: true,
      chip: 0.24,
      knockback: 1.1,
      launch: 5.4,
      hitstun: 24,
      meterGain: 0,
    }),
  }),
};

export const ROSTER: readonly CharacterDef[] = [GRIZLO, SHVEYA, OKO, PECH];

export function characterById(id: string): CharacterDef {
  return ROSTER.find((character) => character.id === id) ?? GRIZLO;
}

/** Balance sanity check used by the select screen and by tests. */
export function moveDuration(moveData: MoveData): number {
  return moveData.startup + moveData.active + moveData.recovery;
}

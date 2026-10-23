/**
 * Core types of the fight simulation.
 *
 * The simulation is deliberately framework-free: no Three.js, no React, no DOM.
 * A fighting game lives or dies on frame data, so the whole ruleset runs on a
 * fixed 60 Hz tick and can be unit-tested (and replayed) in Node.
 */

/** Simulation rate. Every duration in this codebase is expressed in ticks. */
export const TICK_RATE = 60;
export const TICK_SECONDS = 1 / TICK_RATE;

/** Arena bounds in metres from the centre. */
export const ARENA_HALF_WIDTH = 5.2;
/** Fighters cannot occupy the same spot; this is the closest two bodies get. */
export const MIN_SEPARATION = 0.92;

export const GRAVITY = -22;
export const WALL_BOUNCE = 0.25;

export const MAX_HEALTH = 1000;
export const METER_MAX = 300;
export const METER_PER_BAR = 100;
export const ROUND_SECONDS = 60;
export const ROUNDS_TO_WIN = 2;

/** Ticks a fighter needs after a knockdown before it can act again. */
export const WAKEUP_TICKS = 34;
/** Ticks of invulnerability right after standing up (anti meaty). */
export const WAKEUP_INVULN_TICKS = 8;

export type RoundPhase = 'intro' | 'fight' | 'ko' | 'roundOver' | 'matchOver';

export type FighterState =
  | 'idle'
  | 'walk'
  | 'crouch'
  | 'jump'
  | 'attack'
  | 'block'
  | 'blockstun'
  | 'hitstun'
  | 'knockdown'
  | 'wakeup'
  | 'ko'
  | 'victory';

export type MoveId = 'punch' | 'kick' | 'sweep' | 'airkick' | 'special' | 'super';

export type AttackHeight = 'high' | 'mid' | 'low';

/** A button/axis snapshot. Held booleans; the fighter does its own edge detection. */
export interface FrameInput {
  /** −1 left, 0 neutral, 1 right (screen space). */
  readonly horizontal: -1 | 0 | 1;
  /** −1 crouch, 1 jump (edge-triggered by the fighter), 0 none. */
  readonly vertical: -1 | 0 | 1;
  readonly punch: boolean;
  readonly kick: boolean;
  readonly special: boolean;
  readonly super: boolean;
  /** Explicit block button: mobile players should not have to guess "hold back". */
  readonly block: boolean;
}

export const NEUTRAL_INPUT: FrameInput = {
  horizontal: 0,
  vertical: 0,
  punch: false,
  kick: false,
  special: false,
  super: false,
  block: false,
};

export interface ProjectileSpec {
  readonly speed: number;
  readonly damage: number;
  readonly radius: number;
  readonly lifetimeTicks: number;
  /** Altitude of the projectile above the floor. */
  readonly height: number;
  readonly hitstun: number;
  readonly knockback: number;
  readonly kind: 'acid' | 'beam' | 'ember';
}

export interface MoveData {
  readonly id: MoveId;
  readonly label: string;
  /** Frames before the hitbox exists. */
  readonly startup: number;
  /** Frames the hitbox is live. */
  readonly active: number;
  /** Frames of vulnerability after the hitbox is gone. */
  readonly recovery: number;
  readonly damage: number;
  /** Share of `damage` that goes through a block (0…1). */
  readonly chip: number;
  readonly hitstun: number;
  readonly blockstun: number;
  /** Horizontal push applied to the victim, in metres. */
  readonly knockback: number;
  /** Vertical launch speed on hit (juggles). */
  readonly launch?: number;
  readonly height: AttackHeight;
  /** Reach in metres, measured from the attacker's centre. */
  readonly range: number;
  /** Meter gained by the attacker on hit; on block it is a third of this. */
  readonly meterGain: number;
  /** Meter spent to start the move. */
  readonly cost?: number;
  /** Ticks before the move can be used again. */
  readonly cooldown?: number;
  /** Number of separate hit windows (multi-hit specials and supers). */
  readonly hits?: number;
  /** Frames between hits of a multi-hit move. */
  readonly hitInterval?: number;
  /** Knockdown instead of plain hitstun. */
  readonly knockdown?: boolean;
  /** Unblockable (throws/supers): chip is ignored. */
  readonly unblockable?: boolean;
  /** Forward displacement applied over the startup, in metres. */
  readonly advance?: number;
  /** Projectile fired at the end of startup. */
  readonly projectile?: ProjectileSpec;
  /** Attacker keeps taking hits during the move (armoured specials). */
  readonly armor?: boolean;
  /** Fighter cannot be hit while the move is running (teleports). */
  readonly invulnerable?: boolean;
}

export interface CharacterStats {
  readonly walkSpeed: number;
  readonly backSpeed: number;
  readonly jumpSpeed: number;
  /** Knockback multiplier; heavy fighters barely move. */
  readonly weight: number;
  readonly maxHealth: number;
  /** Multiplier on incoming damage, so glass cannons really are glass. */
  readonly defense: number;
}

export type MoveSet = Readonly<Record<MoveId, MoveData>>;

export interface CharacterDef {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly lore: string;
  readonly stats: CharacterStats;
  readonly moves: MoveSet;
  readonly palette: {
    readonly skin: number;
    readonly accent: number;
    readonly cloth: number;
    readonly glow: number;
  };
  readonly model: {
    readonly kind: 'brute' | 'stitched' | 'eye' | 'furnace';
    readonly height: number;
    readonly girth: number;
  };
  /** Difficulty hint shown on the select screen, 1…5. */
  readonly power: number;
  readonly speed: number;
  readonly range: number;
}

export interface Projectile {
  readonly owner: 0 | 1;
  x: number;
  y: number;
  vx: number;
  ticks: number;
  readonly spec: ProjectileSpec;
}

/** Everything the renderer and HUD need to draw a fighter. */
export interface FighterSnapshot {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly facing: 1 | -1;
  readonly hp: number;
  readonly maxHp: number;
  readonly meter: number;
  readonly state: FighterState;
  /** Ticks spent in the current state (drives animation phases). */
  readonly stateTicks: number;
  readonly move: MoveId | null;
  readonly moveTicks: number;
  readonly crouching: boolean;
  readonly blocking: boolean;
  readonly airborne: boolean;
  readonly combo: number;
  readonly roundsWon: number;
  readonly hitFlash: number;
}

export type BattleEvent =
  | { readonly type: 'hit'; readonly attacker: 0 | 1; readonly damage: number; readonly x: number; readonly y: number; readonly heavy: boolean }
  | { readonly type: 'block'; readonly x: number; readonly y: number }
  | { readonly type: 'whiff'; readonly x: number; readonly y: number }
  | { readonly type: 'jump'; readonly who: 0 | 1 }
  | { readonly type: 'land'; readonly who: 0 | 1; readonly x: number }
  | { readonly type: 'ko'; readonly loser: 0 | 1 }
  | { readonly type: 'roundStart'; readonly round: number }
  | { readonly type: 'fight' }
  | { readonly type: 'roundEnd'; readonly winner: 0 | 1 | null }
  | { readonly type: 'matchEnd'; readonly winner: 0 | 1 }
  | { readonly type: 'special'; readonly who: 0 | 1; readonly move: MoveId }
  | { readonly type: 'projectile'; readonly who: 0 | 1 };

export interface BattleSnapshot {
  readonly phase: RoundPhase;
  readonly round: number;
  readonly timer: number;
  readonly fighters: readonly [FighterSnapshot, FighterSnapshot];
  readonly projectiles: readonly Projectile[];
  /** Ticks since the phase changed; the HUD uses it for intros and KOs. */
  readonly phaseTicks: number;
  readonly winner: 0 | 1 | null;
}

/** Public events consumed by audio/effects; drained every rendered frame. */
export type EventSink = (event: BattleEvent) => void;

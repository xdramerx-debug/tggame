import { MAX_BATTLE_ROUNDS } from './constants';
import { createRng } from './rng';
import type {
  BattleEvent, BattleModifiers, BattleResult, BattleUnitSnapshot, ComputedStats, HeroDef, Side,
} from './types';

/**
 * Pure turn-based auto-battle simulation (spec §3).
 * - 6 units per side: index 0..1 front row, 2..5 back row.
 * - Target order: front slot 1 → front slot 2 → back row left to right.
 * - Active skills proc by chance (never 100%) with a visible «cast» marker event.
 * - Output is a replayable event log; the UI never re-simulates.
 */

export interface BattleUnitInput {
  def: HeroDef;
  stats: ComputedStats;
  /** Shadow Pact silence: cannot cast skills (14.4) */
  silenced?: boolean;
  isBoss?: boolean;
  /** legendary equipment effects */
  specials?: { firstStrikeCrit?: boolean; roundOneShield?: boolean; executeLow?: boolean };
  uid?: string | null;
  level?: number;
  rank?: string;
}

export interface BattleRequest {
  allies: BattleUnitInput[];
  enemies: BattleUnitInput[];
  seed: number;
  modifiers?: BattleModifiers;
}

interface LiveUnit {
  input: BattleUnitInput;
  side: Side;
  index: number;
  hp: number;
  maxHp: number;
  shield: number;
  alive: boolean;
  atkBuff: number; // fractional, e.g. 0.25
  atkBuffRounds: number;
  defDebuff: number; // fractional, e.g. 0.3
  defDebuffRounds: number;
  firstAttackDone: boolean;
  revived: boolean;
}

function makeUnit(input: BattleUnitInput, side: Side, index: number, mods: BattleModifiers): LiveUnit {
  let stats = input.stats;
  // Echo of the Fallen buffs (14.1) are applied here — the simulation is the
  // single source of truth so any caller (UI, tests, skip) gets the same result.
  if (side === 'ally') {
    if (mods.echoBuff === 'atk3') stats = { ...stats, atk: Math.round(stats.atk * 1.1) };
    if (mods.echoBuff === 'hp1') stats = { ...stats, hp: Math.round(stats.hp * 1.15) };
  }
  let hp = stats.hp;
  if (side === 'enemy' && mods.mirror?.hpMult) hp = Math.round(hp * mods.mirror.hpMult);
  return {
    input: { ...input, stats }, side, index,
    hp, maxHp: hp,
    shield: 0,
    alive: true,
    atkBuff: 0, atkBuffRounds: 0,
    defDebuff: 0, defDebuffRounds: 0,
    firstAttackDone: false,
    revived: false,
  };
}

function effAtk(u: LiveUnit, mods: BattleModifiers): number {
  let atk = u.input.stats.atk * (1 + u.atkBuff);
  if (u.side === 'ally' && mods.pactSlot === u.index) atk *= 1.3; // Shadow Pact +30% damage
  return atk;
}

function effDef(u: LiveUnit): number {
  return Math.max(0, u.input.stats.def * (1 - u.defDebuff));
}

const ARMOR_K = 350;

/** front slot 0 → slot 1 → back row left to right */
function defaultTargetOrder(units: LiveUnit[]): LiveUnit[] {
  const alive = units.filter((u) => u.alive);
  const front = alive.filter((u) => u.index < 2).sort((a, b) => a.index - b.index);
  const back = alive.filter((u) => u.index >= 2).sort((a, b) => a.index - b.index);
  return [...front, ...back];
}

function pickTargets(order: LiveUnit[], target: string): LiveUnit[] {
  if (order.length === 0) return [];
  switch (target) {
    case 'enemyAll':
    case 'allyAll':
      return order;
    case 'enemyBackRow': {
      const back = order.filter((u) => u.index >= 2);
      return back.length > 0 ? back : order.slice(0, 1);
    }
    case 'enemyLowestHp':
    case 'allyLowestHp': {
      const lowest = order.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b));
      return [lowest];
    }
    default:
      return order.slice(0, 1);
  }
}

function snapshot(units: LiveUnit[]): BattleUnitSnapshot[] {
  return units.map((u) => ({
    side: u.side,
    index: u.index,
    defId: u.input.def.id,
    name: u.input.def.name,
    emoji: u.input.def.emoji,
    faction: u.input.def.faction,
    rarity: u.input.def.rarity,
    rank: (u.input.rank ?? '5') as BattleUnitSnapshot['rank'],
    level: u.input.level ?? 1,
    hp: Math.max(0, u.hp), // final HP; replay UI initializes from maxHp
    maxHp: u.maxHp,
    isBoss: u.input.isBoss,
  }));
}

export function simulateBattle(req: BattleRequest): BattleResult {
  const rng = createRng(req.seed);
  const mods: BattleModifiers = req.modifiers ?? {};
  const events: BattleEvent[] = [];

  const allies = req.allies.slice(0, 6).map((u, i) => makeUnit(u, 'ally', i, mods));
  const enemies = req.enemies.slice(0, 6).map((u, i) => makeUnit(u, 'enemy', i, mods));

  // Round-one shield legendary effect
  for (const u of [...allies, ...enemies]) {
    if (u.input.specials?.roundOneShield) {
      const sh = Math.round(effAtk(u, mods) * 1.5);
      u.shield += sh;
      events.push({ t: 'shield', side: u.side, unit: u.index, amount: sh });
    }
  }

  const teamOf = (side: Side): LiveUnit[] => (side === 'ally' ? allies : enemies);
  const foesOf = (side: Side): LiveUnit[] => (side === 'ally' ? enemies : allies);
  const aliveCount = (side: Side): number => teamOf(side).filter((u) => u.alive).length;

  let firstHitDamage = 0;
  let revivePending = mods.echoBuff === 'revive';
  let rounds = 0;

  const dealDamage = (attacker: LiveUnit, target: LiveUnit, raw: number, opts: { forceCrit?: boolean; execute?: boolean } = {}): void => {
    if (!target.alive) return;
    const brk = attacker.input.stats.armorBreak;
    const mitigation = (effDef(target) * (1 - brk)) / (effDef(target) * (1 - brk) + ARMOR_K);
    let dmg = raw * (1 - mitigation);
    if (opts.execute && target.hp / target.maxHp < 0.3) dmg *= 1.5;

    let crit = opts.forceCrit === true;
    if (!crit && rng.chance(attacker.input.stats.crit)) crit = true;
    if (crit) dmg *= attacker.input.stats.critDmg;
    dmg = Math.max(1, Math.round(dmg));

    const blocked = Math.min(target.shield, dmg);
    target.shield -= blocked;
    dmg -= blocked;
    target.hp -= dmg;

    events.push({
      t: 'damage', side: attacker.side, unit: attacker.index,
      targetSide: target.side, target: target.index,
      amount: dmg + blocked, crit, blocked, targetDead: false,
    });

    if (attacker.side === 'ally' && firstHitDamage === 0) firstHitDamage = dmg + blocked;

    // lifesteal
    const ls = attacker.input.stats.lifesteal;
    if (ls > 0) {
      const healed = Math.min(Math.round((dmg + blocked) * ls), attacker.maxHp - attacker.hp);
      if (healed > 0) {
        attacker.hp += healed;
        events.push({ t: 'lifesteal', side: attacker.side, unit: attacker.index, amount: healed });
      }
    }

    if (target.hp <= 0) {
      target.hp = 0;
      target.alive = false;
      const dmgEvent = [...events].reverse().find((e) => e.t === 'damage' && e.side === attacker.side && e.unit === attacker.index);
      if (dmgEvent?.t === 'damage') dmgEvent.targetDead = true;
      events.push({ t: 'death', side: target.side, unit: target.index });

      // Echo revive (14.1): first fallen ally comes back with 30% HP
      if (revivePending && target.side === 'ally' && !target.revived) {
        revivePending = false;
        target.revived = true;
        target.alive = true;
        target.hp = Math.round(target.maxHp * 0.3);
        events.push({ t: 'revive', side: target.side, unit: target.index, hp: target.hp });
      }
    }
  };

  const doHeal = (caster: LiveUnit, targets: LiveUnit[], mult: number): void => {
    for (const tgt of targets) {
      if (!tgt.alive) continue;
      const amount = Math.round(effAtk(caster, mods) * mult * caster.input.stats.healPower);
      const real = Math.min(amount, tgt.maxHp - tgt.hp);
      if (real <= 0) continue;
      tgt.hp += real;
      events.push({ t: 'heal', side: caster.side, unit: tgt.index, amount: real });
    }
  };

  const takeTurn = (u: LiveUnit): void => {
    if (!u.alive) return;
    events.push({ t: 'turn', side: u.side, unit: u.index });

    const skillChanceRaw = u.input.def.skill.chance;
    let skillChance = u.input.silenced ? 0 : skillChanceRaw;
    if (u.side === 'enemy' && mods.mirror?.skillChanceMult) skillChance = Math.min(0.85, skillChance * mods.mirror.skillChanceMult);

    const foeOrder = defaultTargetOrder(foesOf(u.side));
    const friendOrder = defaultTargetOrder(teamOf(u.side));
    if (foeOrder.length === 0) return;

    const castSkill = skillChance > 0 && rng.chance(skillChance);
    if (castSkill) {
      const skill = u.input.def.skill;
      // Visual marker: «сейчас будет каст»
      events.push({ t: 'cast', side: u.side, unit: u.index, skill: skill.name });
      const eff = skill.effect;
      switch (eff.kind) {
        case 'damage': {
          const targets = pickTargets(foeOrder, eff.target);
          const forceCrit = u.input.specials?.firstStrikeCrit === true && !u.firstAttackDone;
          for (const tgt of targets) {
            dealDamage(u, tgt, eff.mult * effAtk(u, mods), { forceCrit, execute: u.input.specials?.executeLow === true });
          }
          u.firstAttackDone = true;
          break;
        }
        case 'heal': {
          const targets = pickTargets(friendOrder.filter((f) => f.alive), eff.target);
          doHeal(u, targets, eff.mult);
          break;
        }
        case 'shield': {
          const targets = pickTargets(friendOrder.filter((f) => f.alive), eff.target);
          for (const tgt of targets) {
            const amount = Math.round(effAtk(u, mods) * eff.mult);
            tgt.shield += amount;
            events.push({ t: 'shield', side: tgt.side, unit: tgt.index, amount });
          }
          break;
        }
        case 'buffAtk': {
          const targets = pickTargets(friendOrder.filter((f) => f.alive), eff.target);
          for (const tgt of targets) {
            tgt.atkBuff = eff.mult;
            tgt.atkBuffRounds = eff.rounds;
            events.push({ t: 'buff', side: tgt.side, unit: tgt.index, text: `+${Math.round(eff.mult * 100)}% ATK` });
          }
          break;
        }
        case 'debuffDef': {
          const targets = pickTargets(foeOrder, eff.target);
          for (const tgt of targets) {
            tgt.defDebuff = eff.mult;
            tgt.defDebuffRounds = eff.rounds;
            events.push({ t: 'debuff', side: tgt.side, unit: tgt.index, text: `-${Math.round(eff.mult * 100)}% DEF` });
          }
          break;
        }
      }
      return;
    }

    // Basic attack: default target order
    const target = foeOrder[0];
    if (!target) return;
    events.push({ t: 'attack', side: u.side, unit: u.index, targetSide: target.side, target: target.index });
    const forceCrit = u.input.specials?.firstStrikeCrit === true && !u.firstAttackDone;
    dealDamage(u, target, 1.0 * effAtk(u, mods), { forceCrit, execute: u.input.specials?.executeLow === true });
    u.firstAttackDone = true;
  };

  let victory = false;
  outer: for (let round = 1; round <= MAX_BATTLE_ROUNDS; round++) {
    rounds = round;
    events.push({ t: 'round', n: round });
    const order = [...allies, ...enemies]
      .filter((u) => u.alive)
      .sort((a, b) => b.input.stats.spd - a.input.stats.spd || rng.next() - 0.5);
    for (const u of order) {
      takeTurn(u);
      if (aliveCount('enemy') === 0) { victory = true; break outer; }
      if (aliveCount('ally') === 0) { victory = false; break outer; }
    }
    // tick buffs/debuffs
    for (const u of [...allies, ...enemies]) {
      if (u.atkBuffRounds > 0) { u.atkBuffRounds--; if (u.atkBuffRounds === 0) u.atkBuff = 0; }
      if (u.defDebuffRounds > 0) { u.defDebuffRounds--; if (u.defDebuffRounds === 0) u.defDebuff = 0; }
    }
    if (round === MAX_BATTLE_ROUNDS) victory = false; // timeout = defender wins
  }

  if (mods.forceResult === 'win') victory = true;
  if (mods.forceResult === 'lose') victory = false;
  events.push({ t: 'end', victory, rounds });

  return {
    victory,
    rounds,
    events,
    allies: snapshot(allies),
    enemies: snapshot(enemies),
    fallenAllies: allies.filter((u) => !u.alive || u.revived).length,
    fallenEnemies: enemies.filter((u) => !u.alive).length,
    allyUids: req.allies.map((a) => a.uid ?? null),
    firstHitDamage,
    powerAlly: allies.reduce((s, u) => s + u.maxHp, 0),
    powerEnemy: enemies.reduce((s, u) => s + u.maxHp, 0),
  };
}

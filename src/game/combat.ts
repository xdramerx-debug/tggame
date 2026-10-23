import { computeFactionAura, computeHeroStats, FACTION_META, getHeroTemplate } from './heroes';
import type {
  BattleStepResult,
  BattleUnit,
  Faction,
  OwnedHero,
  RelicLevels,
  TargetImpact,
} from './types';

export type RandomFn = () => number;

export function buildAllyUnits(
  lineup: readonly (string | null)[],
  ownedMap: Readonly<Record<string, OwnedHero>>,
  relics: RelicLevels,
): BattleUnit[] {
  const aura = computeFactionAura(lineup);
  const startEnergy = Math.min(85, 35 + relics.wisdom * 5);
  const result: BattleUnit[] = [];

  for (let slot = 0; slot < lineup.length; slot += 1) {
    const heroId = lineup[slot];
    if (!heroId) continue;
    const owned = ownedMap[heroId];
    if (!owned) continue;
    const tpl = getHeroTemplate(heroId);
    const stats = computeHeroStats(owned, relics, aura);

    result.push({
      uid: `ally_${slot}_${heroId}`,
      templateId: heroId,
      name: tpl.name,
      title: tpl.title,
      side: 'ally',
      slot,
      faction: tpl.faction,
      rarity: tpl.rarity,
      role: tpl.role,
      level: owned.level,
      stars: owned.stars,
      isBoss: false,
      visual: tpl.visual,
      skillName: tpl.skillName,
      skillKind: tpl.skillKind,
      skillPower: tpl.skillPower,
      maxHp: stats.maxHp,
      hp: stats.maxHp,
      shield: 0,
      atk: stats.atk,
      def: stats.def,
      speed: stats.speed,
      crit: stats.crit,
      energy: startEnergy,
      frozenTurns: 0,
      burnTurns: 0,
      burnDamage: 0,
      atkBuffTurns: 0,
      critBuffTurns: 0,
    });
  }

  return result;
}

export function getFactionMultiplier(attacker: Faction, defender: Faction): { mult: number; weak: boolean } {
  const meta = FACTION_META[attacker];
  if (meta.beats === defender) {
    return { mult: 1.25, weak: true };
  }
  if (meta.beats === 'all' && defender !== 'astral') {
    return { mult: 1.15, weak: true };
  }
  return { mult: 1.0, weak: false };
}

function getLiving(units: readonly BattleUnit[]): BattleUnit[] {
  return units.filter((u) => u.hp > 0);
}

function pickPrimaryTarget(actor: BattleUnit, foes: readonly BattleUnit[], rng: RandomFn): BattleUnit | null {
  const living = getLiving(foes);
  if (living.length === 0) return null;

  if (actor.role === 'assassin') {
    let weakest = living[0];
    for (const f of living) {
      if (weakest && f.hp / f.maxHp < weakest.hp / weakest.maxHp) {
        weakest = f;
      }
    }
    return weakest ?? null;
  }

  if (actor.role === 'ranger') {
    const idx = Math.min(living.length - 1, Math.floor(rng() * living.length));
    return living[idx] ?? living[0] ?? null;
  }

  const front = living.filter((f) => f.slot < 2);
  const pool = front.length > 0 ? front : living;
  const idx = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[idx] ?? pool[0] ?? null;
}

function applyDamageToUnit(
  attacker: BattleUnit,
  target: BattleUnit,
  rawMultiplier: number,
  rng: RandomFn,
  bonusCrit = 0,
): TargetImpact {
  const atkMult = attacker.atkBuffTurns > 0 ? 1.2 : 1.0;
  const { mult: facMult, weak } = getFactionMultiplier(attacker.faction, target.faction);
  const critChance = Math.min(0.95, attacker.crit + (attacker.critBuffTurns > 0 ? 0.25 : 0) + bonusCrit);
  const isCrit = rng() < critChance;
  const critMult = isCrit ? 1.7 : 1.0;

  const defenseMitigation = 100 / (100 + target.def * 0.9);
  const variance = 0.94 + rng() * 0.12;
  const dmg = Math.max(
    8,
    Math.round(attacker.atk * atkMult * rawMultiplier * facMult * critMult * defenseMitigation * variance),
  );

  let remaining = dmg;
  if (target.shield > 0) {
    const absorbed = Math.min(target.shield, remaining);
    target.shield -= absorbed;
    remaining -= absorbed;
  }

  target.hp = Math.max(0, target.hp - remaining);
  const killed = target.hp <= 0;
  if (!killed) {
    target.energy = Math.min(120, target.energy + 16);
  }

  return {
    targetUid: target.uid,
    amount: dmg,
    isCrit,
    isHeal: false,
    isShield: false,
    isWeakness: weak,
    killed,
  };
}

function applyHealToUnit(target: BattleUnit, rawHeal: number): TargetImpact {
  const amount = Math.max(12, Math.round(rawHeal));
  target.hp = Math.min(target.maxHp, target.hp + amount);
  return {
    targetUid: target.uid,
    amount,
    isCrit: false,
    isHeal: true,
    isShield: false,
    isWeakness: false,
    killed: false,
  };
}

function applyShieldToUnit(target: BattleUnit, rawShield: number): TargetImpact {
  const amount = Math.max(15, Math.round(rawShield));
  target.shield = Math.min(target.maxHp, target.shield + amount);
  return {
    targetUid: target.uid,
    amount,
    isCrit: false,
    isHeal: false,
    isShield: true,
    isWeakness: false,
    killed: false,
  };
}

export interface TurnEngineState {
  turnQueue: string[];
}

export function stepBattleTurn(
  allies: BattleUnit[],
  enemies: BattleUnit[],
  engineState: TurnEngineState,
  options: { autoUlt: boolean; forceUltUid?: string | null; rng?: RandomFn },
): BattleStepResult | null {
  const rng = options.rng ?? Math.random;

  if (getLiving(enemies).length === 0) {
    return null;
  }
  if (getLiving(allies).length === 0) {
    return null;
  }

  const allMap = new Map<string, BattleUnit>();
  for (const u of allies) allMap.set(u.uid, u);
  for (const u of enemies) allMap.set(u.uid, u);

  // If player tapped a specific ready ally to immediately cast Ultimate
  let actor: BattleUnit | undefined;
  if (options.forceUltUid) {
    const candidate = allMap.get(options.forceUltUid);
    if (candidate && candidate.hp > 0 && candidate.energy >= 100 && candidate.frozenTurns <= 0) {
      actor = candidate;
    }
  }

  while (!actor) {
    if (engineState.turnQueue.length === 0) {
      const livingAll = [...getLiving(allies), ...getLiving(enemies)].sort((a, b) => b.speed - a.speed);
      engineState.turnQueue = livingAll.map((u) => u.uid);
      if (engineState.turnQueue.length === 0) return null;
    }
    const nextUid = engineState.turnQueue.shift();
    if (!nextUid) break;
    const unit = allMap.get(nextUid);
    if (!unit || unit.hp <= 0) continue;

    // Tick ongoing burn
    if (unit.burnTurns > 0) {
      unit.burnTurns -= 1;
      unit.hp = Math.max(1, unit.hp - unit.burnDamage);
    }

    // Frozen unit skips action
    if (unit.frozenTurns > 0) {
      unit.frozenTurns -= 1;
      continue;
    }

    actor = unit;
  }

  if (!actor) return null;

  const friendlyTeam = actor.side === 'ally' ? allies : enemies;
  const opposingTeam = actor.side === 'ally' ? enemies : allies;
  const canUlt =
    actor.energy >= 100 &&
    (actor.side === 'enemy' || options.autoUlt || options.forceUltUid === actor.uid);

  const impacts: TargetImpact[] = [];
  let skillTitle = 'Атака';
  let usedVfx = actor.visual.attackVfx;

  if (canUlt) {
    actor.energy = 0;
    skillTitle = actor.skillName;
    usedVfx = actor.visual.ultVfx;

    switch (actor.skillKind) {
      case 'front_cleave_shield': {
        const front = getLiving(opposingTeam).filter((f) => f.slot < 2);
        const targets = front.length > 0 ? front : getLiving(opposingTeam).slice(0, 2);
        for (const t of targets) {
          impacts.push(applyDamageToUnit(actor, t, actor.skillPower, rng));
        }
        impacts.push(applyShieldToUnit(actor, actor.maxHp * 0.25));
        break;
      }
      case 'heal_all_buff': {
        for (const ally of getLiving(friendlyTeam)) {
          const healImpact = applyHealToUnit(ally, actor.atk * actor.skillPower);
          ally.atkBuffTurns = 2;
          impacts.push({ ...healImpact, statusApplied: 'atk_up' });
        }
        break;
      }
      case 'assassinate_reset': {
        const target = pickPrimaryTarget(actor, opposingTeam, rng);
        if (target) {
          const hit = applyDamageToUnit(actor, target, actor.skillPower, rng, 0.2);
          impacts.push(hit);
          if (hit.killed) {
            actor.energy = 55;
          }
        }
        break;
      }
      case 'team_shield_smash': {
        const front = getLiving(opposingTeam).slice(0, 2);
        for (const t of front) {
          impacts.push(applyDamageToUnit(actor, t, actor.skillPower, rng));
        }
        for (const ally of getLiving(friendlyTeam)) {
          impacts.push(applyShieldToUnit(ally, actor.maxHp * 0.22));
        }
        break;
      }
      case 'lifesteal_burst': {
        const target = pickPrimaryTarget(actor, opposingTeam, rng);
        if (target) {
          const hit = applyDamageToUnit(actor, target, actor.skillPower, rng, 0.12);
          impacts.push(hit);
          impacts.push(applyHealToUnit(actor, hit.amount * 0.4));
        }
        break;
      }
      case 'execute_backline': {
        const back = getLiving(opposingTeam).filter((f) => f.slot >= 2);
        const targets = back.length > 0 ? back : getLiving(opposingTeam);
        for (const t of targets) {
          const bonusMult = t.hp / t.maxHp < 0.5 ? actor.skillPower * 1.45 : actor.skillPower;
          impacts.push(applyDamageToUnit(actor, t, bonusMult, rng, 0.12));
        }
        break;
      }
      case 'aoe_freeze': {
        let frozenCount = 0;
        for (const t of getLiving(opposingTeam)) {
          const hit = applyDamageToUnit(actor, t, actor.skillPower, rng);
          if (!hit.killed && frozenCount < 2 && rng() < 0.65) {
            t.frozenTurns = 1;
            frozenCount += 1;
            impacts.push({ ...hit, statusApplied: 'freeze' });
          } else {
            impacts.push(hit);
          }
        }
        break;
      }
      case 'aoe_burn': {
        for (const t of getLiving(opposingTeam)) {
          const hit = applyDamageToUnit(actor, t, actor.skillPower, rng);
          if (!hit.killed) {
            t.burnTurns = 2;
            t.burnDamage = Math.max(12, Math.round(actor.atk * 0.55));
            impacts.push({ ...hit, statusApplied: 'burn' });
          } else {
            impacts.push(hit);
          }
        }
        break;
      }
      case 'multi_arrow': {
        for (let shot = 0; shot < 4; shot += 1) {
          const pool = getLiving(opposingTeam);
          if (pool.length === 0) break;
          const chosen = pool[Math.floor(rng() * pool.length)];
          if (chosen) {
            impacts.push(applyDamageToUnit(actor, chosen, actor.skillPower, rng, 0.1));
          }
        }
        break;
      }
      case 'supernova_crit': {
        for (const t of getLiving(opposingTeam)) {
          impacts.push(applyDamageToUnit(actor, t, actor.skillPower, rng));
        }
        const livingFriends = getLiving(friendlyTeam);
        let lowest = livingFriends[0];
        for (const f of livingFriends) {
          f.critBuffTurns = 2;
          if (lowest && f.hp / f.maxHp < lowest.hp / lowest.maxHp) lowest = f;
        }
        if (lowest) {
          impacts.push(applyShieldToUnit(lowest, actor.atk * 1.6));
        }
        break;
      }
      case 'divine_judgment': {
        for (const t of getLiving(opposingTeam)) {
          impacts.push(applyDamageToUnit(actor, t, actor.skillPower, rng, 0.1));
        }
        for (const f of getLiving(friendlyTeam)) {
          impacts.push(applyHealToUnit(f, actor.atk * 1.25));
          if (f.uid !== actor.uid) {
            f.energy = Math.min(120, f.energy + 25);
          }
        }
        break;
      }
      case 'void_drain': {
        for (const t of getLiving(opposingTeam)) {
          const hit = applyDamageToUnit(actor, t, actor.skillPower, rng, 0.15);
          t.energy = Math.max(0, t.energy - 18);
          impacts.push(hit);
        }
        break;
      }
      case 'aoe_damage': {
        for (const t of getLiving(opposingTeam)) {
          impacts.push(applyDamageToUnit(actor, t, actor.skillPower, rng));
        }
        break;
      }
    }
  } else {
    // Standard attack (Healer normal attack heals lowest injured ally if anyone < 65% HP, else attacks!)
    const injuredAlly =
      actor.role === 'healer'
        ? getLiving(friendlyTeam).find((a) => a.hp / a.maxHp < 0.65)
        : undefined;

    if (injuredAlly) {
      impacts.push(applyHealToUnit(injuredAlly, actor.atk * 0.95));
      usedVfx = 'ult_bloom';
    } else {
      const target = pickPrimaryTarget(actor, opposingTeam, rng);
      if (target) {
        impacts.push(applyDamageToUnit(actor, target, 1.0, rng));
      }
    }
    actor.energy = Math.min(120, actor.energy + 50);
  }

  if (actor.atkBuffTurns > 0) actor.atkBuffTurns -= 1;
  if (actor.critBuffTurns > 0) actor.critBuffTurns -= 1;

  const outcome =
    getLiving(enemies).length === 0
      ? 'victory'
      : getLiving(allies).length === 0
        ? 'defeat'
        : 'ongoing';

  return {
    actorUid: actor.uid,
    actorName: actor.name,
    actorSide: actor.side,
    isUlt: canUlt,
    skillName: skillTitle,
    vfx: usedVfx,
    impacts,
    outcome,
  };
}

export function castAstralMeteorStrike(
  enemies: BattleUnit[],
  squadPower: number,
  rng: RandomFn = Math.random,
): TargetImpact[] {
  const impacts: TargetImpact[] = [];
  const rawBase = Math.max(75, Math.round(squadPower * 0.24));
  for (const enemy of getLiving(enemies)) {
    const isCrit = rng() < 0.35;
    const dmg = Math.round(rawBase * (isCrit ? 1.55 : 1.0) * (0.95 + rng() * 0.1));
    enemy.hp = Math.max(0, enemy.hp - dmg);
    impacts.push({
      targetUid: enemy.uid,
      amount: dmg,
      isCrit,
      isHeal: false,
      isShield: false,
      isWeakness: false,
      killed: enemy.hp <= 0,
    });
  }
  return impacts;
}

export function simulateFullBattle(
  initialAllies: readonly BattleUnit[],
  initialEnemies: readonly BattleUnit[],
  rng: RandomFn = Math.random,
): { readonly outcome: 'victory' | 'defeat'; readonly steps: BattleStepResult[] } {
  const allies = initialAllies.map((u) => ({ ...u }));
  const enemies = initialEnemies.map((u) => ({ ...u }));
  const state: TurnEngineState = { turnQueue: [] };
  const steps: BattleStepResult[] = [];

  for (let i = 0; i < 120; i += 1) {
    const step = stepBattleTurn(allies, enemies, state, { autoUlt: true, rng });
    if (!step) break;
    steps.push(step);
    if (step.outcome !== 'ongoing') {
      return { outcome: step.outcome, steps };
    }
  }

  return {
    outcome: getLiving(enemies).length === 0 ? 'victory' : 'defeat',
    steps,
  };
}

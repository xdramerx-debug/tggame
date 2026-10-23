import type { AuraInfo, Faction, HeroDef, Role } from './types';

/**
 * Faction auras (spec §3): mono-faction, mixed «Рубежь/Разрушение» (Ruin),
 * «Искупление» (Redemption), «Радуга» (rainbow) + light role synergies.
 * Auras are computed from the team's hero defs and applied to every member.
 */

function countFactions(defs: HeroDef[]): Map<Faction, number> {
  const m = new Map<Faction, number>();
  for (const d of defs) m.set(d.faction, (m.get(d.faction) ?? 0) + 1);
  return m;
}

function countRoles(defs: HeroDef[]): Map<Role, number> {
  const m = new Map<Role, number>();
  for (const d of defs) m.set(d.role, (m.get(d.role) ?? 0) + 1);
  return m;
}

const MONO_BONUS: Record<Faction, AuraInfo['mods']> = {
  shadow: { armorBreak: 0.2 },
  abyss: { lifesteal: 0.08 },
  forest: { healPower: 0.25 },
  fortress: { def: 0.25 },
  light: { controlImmunity: 0.3 },
  dark: { controlImmunity: 0.3, crit: 0.1 },
};

const MONO_NAME: Record<Faction, string> = {
  shadow: 'Тень монолита', abyss: 'Зов бездны', forest: 'Древняя роща',
  fortress: 'Несокрушимость', light: 'Рассветный хор', dark: 'Полночная месса',
};

export function computeAuras(defs: HeroDef[]): AuraInfo[] {
  const auras: AuraInfo[] = [];
  if (defs.length === 0) return auras;

  const fc = countFactions(defs);
  const rc = countRoles(defs);
  const full = defs.length >= 6;

  // Mono-faction: every hero of one faction (full team)
  if (full && fc.size === 1) {
    const f = [...fc.keys()][0] ?? 'shadow';
    auras.push({
      id: `mono-${f}`,
      name: MONO_NAME[f],
      desc: 'Вся команда — одна фракция: +20% HP и профильный бонус',
      mods: { hp: 0.2, ...MONO_BONUS[f] },
    });
  }

  // Ruin: 2 Shadow + 2 Dark + 2 Abyss
  if ((fc.get('shadow') ?? 0) >= 2 && (fc.get('dark') ?? 0) >= 2 && (fc.get('abyss') ?? 0) >= 2) {
    auras.push({ id: 'ruin', name: 'Разрушение', desc: '2 Тень + 2 Тьма + 2 Бездна: +13% атака, +11% HP', mods: { atk: 0.13, hp: 0.11 } });
  }

  // Redemption: 2 Light + 2 Forest + 2 Fortress
  if ((fc.get('light') ?? 0) >= 2 && (fc.get('forest') ?? 0) >= 2 && (fc.get('fortress') ?? 0) >= 2) {
    auras.push({ id: 'redemption', name: 'Искупление', desc: '2 Свет + 2 Лес + 2 Крепость: +12% HP, +20% лечение, +8% защита', mods: { hp: 0.12, healPower: 0.2, def: 0.08 } });
  }

  // Rainbow: 6 different factions
  if (full && fc.size === 6) {
    auras.push({ id: 'rainbow', name: 'Радуга фракций', desc: 'Все 6 фракций в отряде: +10% ко всем основным характеристикам', mods: { hp: 0.1, atk: 0.1, def: 0.1, spd: 0.05 } });
  }

  // Role synergies (не перегружать на старте — только две)
  if ((rc.get('tank') ?? 0) >= 2) {
    auras.push({ id: 'role-tank', name: 'Стена щитов', desc: '2+ танка: +10% HP отряду', mods: { hp: 0.1 } });
  }
  if ((rc.get('healer') ?? 0) >= 2) {
    auras.push({ id: 'role-healer', name: 'Круг целителей', desc: '2+ лекаря: +25% сила лечения', mods: { healPower: 0.25 } });
  }

  return auras;
}

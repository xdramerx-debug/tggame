import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowUpCircle,
  CheckCircle2,
  Coins,
  Hammer,
  Lock,
  PlusCircle,
  Sparkles,
  Star,
  Swords,
} from 'lucide-react';
import { playSfx } from '@/audio/sfx';
import { HeroRig } from '@/components/HeroRig';
import type { RigAnimState } from '@/components/HeroRig';
import {
  computeFactionAura,
  computeHeroStats,
  EQUIP_SLOT_META,
  EQUIP_TIERS,
  FACTION_META,
  formatCompactNumber,
  getAscendShardCost,
  getHeroTemplate,
  getLevelUpCost,
  HERO_ROSTER,
  RARITY_META,
  ROLE_NAMES,
} from '@/game/heroes';
import type { EquipSlot, Faction } from '@/game/types';
import { haptic } from '@/platform/telegram';
import { useGameStore } from '@/state/gameStore';

const EQUIP_SLOTS: readonly EquipSlot[] = ['weapon', 'armor', 'ring', 'relic'];

export function HeroesScreen() {
  const selectedHeroId = useGameStore((s) => s.selectedHeroId);
  const selectHero = useGameStore((s) => s.selectHero);
  const ownedHeroes = useGameStore((s) => s.ownedHeroes);
  const lineup = useGameStore((s) => s.lineup);
  const relics = useGameStore((s) => s.relics);
  const gold = useGameStore((s) => s.gold);
  const essence = useGameStore((s) => s.essence);

  const levelUpHero = useGameStore((s) => s.levelUpHero);
  const ascendHero = useGameStore((s) => s.ascendHero);
  const upgradeEquip = useGameStore((s) => s.upgradeEquip);
  const autoUpgradeHeroGear = useGameStore((s) => s.autoUpgradeHeroGear);
  const setLineupSlot = useGameStore((s) => s.setLineupSlot);
  const setActiveTab = useGameStore((s) => s.setActiveTab);

  const [factionFilter, setFactionFilter] = useState<'all' | Faction>('all');
  const [previewAnim, setPreviewAnim] = useState<RigAnimState>('idle');
  const [flashKey, setFlashKey] = useState(0);

  const tpl = getHeroTemplate(selectedHeroId);
  const owned = ownedHeroes[tpl.id];
  const aura = computeFactionAura(lineup);
  const factionMeta = FACTION_META[tpl.faction];
  const rarityMeta = RARITY_META[tpl.rarity];

  const stats = owned
    ? computeHeroStats(owned, relics, aura)
    : computeHeroStats(
        {
          heroId: tpl.id,
          level: 1,
          stars: rarityMeta.baseStars,
          shards: 0,
          equip: { weapon: 0, armor: 0, ring: 0, relic: 0 },
        },
        relics,
      );

  const lvlCost = owned ? getLevelUpCost(owned.level) : { gold: 0, essence: 0 };
  const canLevel1 = Boolean(owned && gold >= lvlCost.gold && essence >= lvlCost.essence);
  const neededShards = owned ? getAscendShardCost(owned.stars) : 999;
  const canAscend = Boolean(owned && owned.stars < 10 && owned.shards >= neededShards);
  const deployedSlotIndex = lineup.indexOf(tpl.id);

  const triggerShowcaseAnim = (state: RigAnimState) => {
    setPreviewAnim(state);
    setFlashKey((k) => k + 1);
    window.setTimeout(() => {
      setPreviewAnim('idle');
    }, 450);
  };

  const handleToggleDeploy = () => {
    if (!owned) return;
    playSfx('tap');
    if (deployedSlotIndex !== -1) {
      setLineupSlot(deployedSlotIndex, null);
    } else {
      const openIdx = lineup.findIndex((s) => s === null);
      setLineupSlot(openIdx !== -1 ? openIdx : 4, tpl.id);
    }
  };

  const filteredRoster = HERO_ROSTER.filter(
    (h) => factionFilter === 'all' || h.faction === factionFilter,
  );

  return (
    <div className="mx-auto flex h-full w-full max-w-lg flex-col gap-2.5 overflow-y-auto px-3 py-2.5 custom-scroll">
      {/* Selected Hero Showcase Card */}
      <div
        style={{
          background: `radial-gradient(circle at 24% 35%, ${tpl.visual.primary}38 0%, rgba(15,23,42,0.95) 68%)`,
          borderColor: rarityMeta.border,
        }}
        className="relative overflow-hidden rounded-3xl border p-3 shadow-2xl shrink-0"
      >
        {/* Upgrade golden flash ring */}
        {flashKey > 0 && (
          <motion.div
            key={flashKey}
            initial={{ opacity: 0.75, scale: 0.5 }}
            animate={{ opacity: 0, scale: 1.8 }}
            transition={{ duration: 0.5 }}
            className="pointer-events-none absolute left-14 top-14 h-24 w-24 rounded-full border-2 border-amber-300"
          />
        )}

        <div className="flex items-center gap-3">
          {/* Animated Hero Pedestal */}
          <div
            role="presentation"
            onClick={() => {
              playSfx('ult');
              triggerShowcaseAnim('ult');
            }}
            className="relative flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-slate-950/60 p-2 cursor-pointer shrink-0"
          >
            <HeroRig
              visual={tpl.visual}
              size={104}
              stars={owned?.stars ?? rarityMeta.baseStars}
              energyReady={Boolean(owned)}
              animState={previewAnim}
            />
            <span className="mt-0.5 text-[9px] font-bold text-amber-300/90">
              Тап — превью ульты
            </span>
          </div>

          {/* Info & Stats Column */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                style={{ backgroundColor: rarityMeta.color }}
                className="rounded px-1.5 py-0.5 text-[9px] font-black text-slate-950"
              >
                {rarityMeta.badge} · {rarityMeta.name}
              </span>
              <span
                style={{ color: factionMeta.color, backgroundColor: factionMeta.bg }}
                className="rounded-md px-1.5 py-0.5 text-[9px] font-extrabold"
              >
                {factionMeta.name} · {ROLE_NAMES[tpl.role]}
              </span>
            </div>

            <div className="mt-1 flex items-baseline justify-between gap-2">
              <h2 className="truncate text-base font-black text-white">
                {tpl.name}{' '}
                <span className="text-xs font-semibold text-slate-300">· {tpl.title}</span>
              </h2>
            </div>

            {/* Stars Row */}
            <div className="mt-0.5 flex items-center justify-between">
              <div className="flex items-center gap-0.5">
                {Array.from({ length: Math.min(5, owned?.stars ?? rarityMeta.baseStars) }).map(
                  (_, idx) => (
                    <Star
                      key={idx}
                      className={`h-3.5 w-3.5 fill-current ${
                        (owned?.stars ?? 1) > 5 ? 'text-rose-400' : 'text-amber-400'
                      }`}
                    />
                  ),
                )}
                {(owned?.stars ?? 0) > 5 && (
                  <span className="ml-1 text-[10px] font-black text-rose-300">
                    +{owned ? owned.stars - 5 : 0}★
                  </span>
                )}
              </div>

              <span className="text-xs font-black text-amber-300">
                Ур. {owned?.level ?? 1} · Мощь {formatCompactNumber(stats.power)}
              </span>
            </div>

            {/* 4 Key Stats Grid */}
            <div className="mt-2 grid grid-cols-4 gap-1 rounded-xl bg-slate-950/75 p-1.5 text-center border border-white/5">
              <div>
                <div className="text-[8px] font-bold text-slate-400">HP</div>
                <div className="text-[11px] font-extrabold text-emerald-300">
                  {formatCompactNumber(stats.maxHp)}
                </div>
              </div>
              <div>
                <div className="text-[8px] font-bold text-slate-400">АТК</div>
                <div className="text-[11px] font-extrabold text-amber-200">
                  {formatCompactNumber(stats.atk)}
                </div>
              </div>
              <div>
                <div className="text-[8px] font-bold text-slate-400">ЗАЩ</div>
                <div className="text-[11px] font-extrabold text-sky-200">
                  {formatCompactNumber(stats.def)}
                </div>
              </div>
              <div>
                <div className="text-[8px] font-bold text-slate-400">КРИТ</div>
                <div className="text-[11px] font-extrabold text-fuchsia-300">
                  {Math.round(stats.crit * 100)}%
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Ultimate Skill Description Box */}
        <div className="mt-2.5 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-amber-300">
              ✦ Навык: «{tpl.skillName}»
            </span>
            {owned && (
              <button
                type="button"
                onClick={handleToggleDeploy}
                className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-extrabold transition active:scale-95 ${
                  deployedSlotIndex !== -1
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                    : 'bg-indigo-600 text-white'
                }`}
              >
                {deployedSlotIndex !== -1 ? (
                  <>
                    <CheckCircle2 className="h-3 w-3" />В отряде (#{deployedSlotIndex + 1})
                  </>
                ) : (
                  <>
                    <PlusCircle className="h-3 w-3" />В отряд
                  </>
                )}
              </button>
            )}
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-300">{tpl.skillDesc}</p>
        </div>

        {/* Owned Upgrade Controls OR Unowned Summon CTA */}
        {owned ? (
          <div className="mt-2.5 space-y-2">
            <div className="grid grid-cols-12 gap-2">
              <button
                type="button"
                disabled={!canLevel1}
                onClick={() => {
                  if (levelUpHero(tpl.id, 1)) {
                    playSfx('levelup');
                    haptic('light');
                    triggerShowcaseAnim('attack');
                  }
                }}
                className="btn-gloss col-span-5 flex flex-col items-center justify-center rounded-xl bg-gradient-to-b from-emerald-400 to-emerald-600 px-2 py-1.5 text-slate-950 shadow disabled:opacity-40 active:scale-95"
              >
                <div className="flex items-center gap-1 text-xs font-black">
                  <ArrowUpCircle className="h-3.5 w-3.5" />
                  <span>Уровень +1</span>
                </div>
                <div className="flex items-center gap-1.5 text-[9px] font-extrabold">
                  <span>{formatCompactNumber(lvlCost.gold)} зол.</span>
                  <span>·</span>
                  <span>{formatCompactNumber(lvlCost.essence)} эсс.</span>
                </div>
              </button>

              <button
                type="button"
                disabled={!canLevel1}
                onClick={() => {
                  if (levelUpHero(tpl.id, 5)) {
                    playSfx('levelup');
                    haptic('medium');
                    triggerShowcaseAnim('ult');
                  }
                }}
                className="col-span-3 flex flex-col items-center justify-center rounded-xl border border-emerald-400/45 bg-emerald-500/20 px-2 py-1.5 text-emerald-200 disabled:opacity-35 active:scale-95"
              >
                <span className="text-xs font-black">Ур. +5</span>
                <span className="text-[9px] font-semibold">Быстро</span>
              </button>

              <button
                type="button"
                disabled={!canAscend}
                onClick={() => {
                  if (ascendHero(tpl.id)) {
                    playSfx('ascend');
                    haptic('heavy');
                    triggerShowcaseAnim('ult');
                  }
                }}
                className={`col-span-4 flex flex-col items-center justify-center rounded-xl border px-2 py-1.5 transition active:scale-95 ${
                  canAscend
                    ? 'btn-gloss border-amber-300 bg-gradient-to-b from-amber-400 to-orange-500 text-slate-950 shadow-lg'
                    : 'border-white/10 bg-slate-900/90 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-1 text-[11px] font-black">
                  <Sparkles className="h-3 w-3" />
                  <span>Звезда ★</span>
                </div>
                <span className="text-[9px] font-bold">
                  Осколки: {owned.shards}/{neededShards}
                </span>
              </button>
            </div>

            {/* 4 Equipment Slots + Auto Forge */}
            <div className="rounded-xl border border-white/10 bg-slate-950/65 p-2">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-300">
                  Снаряжение героя (Ковка за золото)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const count = autoUpgradeHeroGear(tpl.id);
                    if (count > 0) {
                      playSfx('levelup');
                      haptic('medium');
                      triggerShowcaseAnim('attack');
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-amber-500/20 border border-amber-400/40 px-2 py-0.5 text-[10px] font-bold text-amber-200 active:scale-95"
                >
                  <Hammer className="h-3 w-3" />
                  Улучшить всё
                </button>
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                {EQUIP_SLOTS.map((slot) => {
                  const tierIdx = owned.equip[slot];
                  const curTier = EQUIP_TIERS[tierIdx] ?? EQUIP_TIERS[0];
                  const nextTier = EQUIP_TIERS[tierIdx + 1];
                  const affordable = Boolean(nextTier && gold >= nextTier.forgeCostGold);

                  return (
                    <button
                      key={slot}
                      type="button"
                      disabled={!affordable}
                      onClick={() => {
                        if (upgradeEquip(tpl.id, slot)) {
                          playSfx('coin');
                          haptic('light');
                        }
                      }}
                      style={{ borderColor: `${curTier?.color ?? '#64748b'}66` }}
                      className="flex flex-col items-center rounded-xl border bg-slate-900/90 p-1.5 text-center transition disabled:opacity-60 active:scale-95"
                    >
                      <span className="text-[9px] font-bold text-slate-400">
                        {EQUIP_SLOT_META[slot].name}
                      </span>
                      <span
                        style={{ color: curTier?.color }}
                        className="mt-0.5 text-[10px] font-black leading-tight"
                      >
                        {curTier?.name}
                      </span>
                      <span className="mt-1 inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-300">
                        {nextTier ? (
                          <>
                            <Coins className="h-2.5 w-2.5" />
                            {formatCompactNumber(nextTier.forgeCostGold)}
                          </>
                        ) : (
                          'МАКС'
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-2.5 flex items-center justify-between rounded-xl border border-fuchsia-400/30 bg-fuchsia-950/35 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-fuchsia-100">
              <Lock className="h-4 w-4 text-fuchsia-400 shrink-0" />
              <span>Герой ещё не призван в ваш Легион</span>
            </div>
            <button
              type="button"
              onClick={() => {
                playSfx('tap');
                setActiveTab('summon');
              }}
              className="rounded-xl bg-fuchsia-600 px-3 py-1.5 text-xs font-black text-white active:scale-95"
            >
              В Портал
            </button>
          </div>
        )}
      </div>

      {/* Faction Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 shrink-0">
        {(
          [
            { id: 'all', label: `Все (${Object.keys(ownedHeroes).length}/${HERO_ROSTER.length})` },
            { id: 'flame', label: 'Пламя' },
            { id: 'sylvan', label: 'Природа' },
            { id: 'frost', label: 'Лёд' },
            { id: 'astral', label: 'Астрал' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              playSfx('tap');
              setFactionFilter(tab.id);
            }}
            className={`rounded-full px-3 py-1 text-xs font-bold whitespace-nowrap transition ${
              factionFilter === tab.id
                ? 'bg-amber-400 text-slate-950 shadow'
                : 'border border-white/10 bg-slate-900/80 text-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Collection Roster Grid */}
      <div className="grid grid-cols-3 gap-2 pb-2">
        {filteredRoster.map((hero) => {
          const heroOwned = ownedHeroes[hero.id];
          const isSelected = hero.id === tpl.id;
          const rMeta = RARITY_META[hero.rarity];
          const inSquad = lineup.includes(hero.id);
          const readyStar = Boolean(
            heroOwned && heroOwned.stars < 10 && heroOwned.shards >= getAscendShardCost(heroOwned.stars),
          );

          return (
            <button
              key={hero.id}
              type="button"
              onClick={() => {
                playSfx('tap');
                selectHero(hero.id);
              }}
              style={{
                borderColor: isSelected ? '#fbbf24' : rMeta.border,
              }}
              className={`relative flex flex-col items-center rounded-2xl border p-2 transition active:scale-95 ${
                heroOwned ? 'bg-slate-900/90' : 'bg-slate-950/65 opacity-65'
              } ${isSelected ? 'ring-2 ring-amber-400/70' : ''}`}
            >
              {inSquad && (
                <span className="absolute left-1.5 top-1.5 rounded bg-emerald-500/90 px-1 py-0.5 text-[8px] font-black text-slate-950">
                  В БОЮ
                </span>
              )}
              {readyStar && (
                <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" />
              )}

              <HeroRig
                visual={hero.visual}
                size={68}
                stars={heroOwned?.stars ?? rMeta.baseStars}
              />

              <div className="mt-0.5 w-full truncate text-center text-xs font-black text-white">
                {hero.name}
              </div>
              <div className="flex items-center justify-center gap-1 text-[10px] font-bold">
                {heroOwned ? (
                  <>
                    <span className="text-amber-300">Ур.{heroOwned.level}</span>
                    <span className="text-slate-500">·</span>
                    <span className="text-amber-400">{heroOwned.stars}★</span>
                  </>
                ) : (
                  <span className="inline-flex items-center gap-0.5 text-slate-400">
                    <Swords className="h-2.5 w-2.5" />
                    Не открыт
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

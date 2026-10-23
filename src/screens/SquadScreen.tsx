import { useState } from 'react';
import { Flame, Hexagon, Shield, Sparkles, Wand2, X } from 'lucide-react';
import { playSfx } from '@/audio/sfx';
import { HeroRig } from '@/components/HeroRig';
import {
  computeFactionAura,
  computeHeroStats,
  formatCompactNumber,
  getHeroTemplate,
  getRelicUpgradeCost,
  RELIC_DEFS,
  ROLE_NAMES,
} from '@/game/heroes';
import { haptic } from '@/platform/telegram';
import { useGameStore } from '@/state/gameStore';

export function SquadScreen() {
  const lineup = useGameStore((s) => s.lineup);
  const ownedHeroes = useGameStore((s) => s.ownedHeroes);
  const relics = useGameStore((s) => s.relics);
  const relicStones = useGameStore((s) => s.relicStones);

  const setLineupSlot = useGameStore((s) => s.setLineupSlot);
  const autoBestLineup = useGameStore((s) => s.autoBestLineup);
  const upgradeRelic = useGameStore((s) => s.upgradeRelic);

  const [selectedSlot, setSelectedSlot] = useState<number>(0);

  const aura = computeFactionAura(lineup);
  const ownedList = Object.values(ownedHeroes);

  const renderSlotCard = (slotIndex: number, rowTag: string) => {
    const heroId = lineup[slotIndex] ?? null;
    const owned = heroId ? ownedHeroes[heroId] : undefined;
    const tpl = heroId ? getHeroTemplate(heroId) : undefined;
    const isTarget = selectedSlot === slotIndex;

    return (
      <div
        key={slotIndex}
        role="button"
        tabIndex={0}
        onClick={() => {
          playSfx('tap');
          setSelectedSlot(slotIndex);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setSelectedSlot(slotIndex);
        }}
        className={`relative flex flex-col items-center justify-between rounded-2xl border p-2 text-center transition cursor-pointer ${
          isTarget
            ? 'border-amber-400 bg-amber-500/15 ring-2 ring-amber-400/50'
            : 'border-white/10 bg-slate-900/85'
        }`}
      >
        <div className="flex w-full items-center justify-between text-[9px] font-bold text-slate-400">
          <span>
            #{slotIndex + 1} {rowTag}
          </span>
          {heroId && (
            <button
              type="button"
              aria-label="Убрать из слота"
              onClick={(ev) => {
                ev.stopPropagation();
                playSfx('tap');
                setLineupSlot(slotIndex, null);
              }}
              className="rounded bg-slate-800 p-0.5 text-slate-300 hover:text-rose-400"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {tpl && owned ? (
          <>
            <HeroRig visual={tpl.visual} size={62} stars={owned.stars} />
            <div className="w-full truncate text-[11px] font-black text-white">{tpl.name}</div>
            <div className="text-[9px] font-bold text-amber-300">
              Ур.{owned.level} · {ROLE_NAMES[tpl.role]}
            </div>
          </>
        ) : (
          <div className="flex h-[84px] flex-col items-center justify-center text-slate-500">
            <Shield className="h-5 w-5 opacity-40" />
            <span className="mt-1 text-[9px] font-bold">Свободный слот</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-lg flex-col gap-2.5 overflow-y-auto px-3 py-2.5 custom-scroll">
      {/* Synergy Aura Banner + Auto Best Lineup */}
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-emerald-400/30 bg-gradient-to-r from-slate-900 via-emerald-950/40 to-slate-900 p-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-black text-emerald-300">
            <Sparkles className="h-4 w-4 shrink-0 text-amber-300" />
            <span>{aura.name}</span>
          </div>
          <p className="mt-0.5 text-[10px] leading-snug text-slate-300">{aura.description}</p>
        </div>

        <button
          type="button"
          onClick={() => {
            playSfx('levelup');
            haptic('medium');
            autoBestLineup();
          }}
          className="btn-gloss shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 px-3 py-2 text-xs font-black text-slate-950 shadow active:scale-95"
        >
          <Wand2 className="h-3.5 w-3.5" />
          Авто-строй
        </button>
      </div>

      {/* Interactive Back Row (3 slots) & Front Row (2 slots) */}
      <div className="rounded-3xl border border-white/10 bg-slate-950/65 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-extrabold text-slate-300">
            Выберите слот (#{selectedSlot + 1}), затем нажмите на героя ниже
          </span>
        </div>

        <div className="grid grid-cols-12 items-center gap-2">
          {/* Back Row: 3 slots */}
          <div className="col-span-7 grid grid-cols-3 gap-1.5">
            {[2, 3, 4].map((slot) => renderSlotCard(slot, 'Тыл'))}
          </div>

          {/* Front Row: 2 slots */}
          <div className="col-span-5 grid grid-cols-2 gap-1.5">
            {[0, 1].map((slot) => renderSlotCard(slot, 'Фронт'))}
          </div>
        </div>

        {/* Quick Owned Hero Picker Bar */}
        <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-1 custom-scroll">
          {ownedList.map((owned) => {
            const tpl = getHeroTemplate(owned.heroId);
            const st = computeHeroStats(owned, relics, aura);
            const inLineup = lineup.includes(owned.heroId);

            return (
              <button
                key={owned.heroId}
                type="button"
                onClick={() => {
                  playSfx('tap');
                  haptic('light');
                  setLineupSlot(selectedSlot, owned.heroId);
                }}
                className={`flex shrink-0 flex-col items-center rounded-xl border px-2.5 py-1.5 transition active:scale-95 ${
                  inLineup
                    ? 'border-emerald-400/50 bg-emerald-950/40'
                    : 'border-white/10 bg-slate-900/90'
                }`}
              >
                <span className="text-[10px] font-black text-white">{tpl.name}</span>
                <span className="text-[9px] font-bold text-amber-300">
                  {formatCompactNumber(st.power)} мощи
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Ancient Relics Passive Tech Tree */}
      <div className="rounded-3xl border border-purple-400/25 bg-slate-900/85 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h3 className="flex items-center gap-1.5 text-xs font-black text-white">
              <Flame className="h-4 w-4 text-purple-400" />
              Древние Реликвии Легиона
            </h3>
            <p className="text-[10px] text-slate-400">
              Усиливают весь отряд навсегда (камни падают с Боссов и в Башне)
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-purple-400/40 bg-purple-950/60 px-2.5 py-1">
            <Hexagon className="h-3.5 w-3.5 text-purple-300 fill-purple-500/30" />
            <span className="text-xs font-black text-purple-100">{relicStones}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {RELIC_DEFS.map((rel) => {
            const curLevel = relics[rel.key];
            const cost = getRelicUpgradeCost(curLevel);
            const canBuy = relicStones >= cost;

            return (
              <div
                key={rel.key}
                className="flex flex-col justify-between rounded-2xl border border-white/10 bg-slate-950/75 p-2.5"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span style={{ color: rel.color }} className="text-xs font-black">
                      {rel.name}
                    </span>
                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-extrabold text-white">
                      Ур.{curLevel}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] leading-snug text-slate-300">
                    {rel.perLevelDesc}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={!canBuy}
                  onClick={() => {
                    if (upgradeRelic(rel.key)) {
                      playSfx('ascend');
                      haptic('medium');
                    }
                  }}
                  className="mt-2 flex items-center justify-center gap-1 rounded-xl bg-purple-600 py-1.5 text-[11px] font-black text-white transition disabled:bg-slate-800 disabled:text-slate-500 active:scale-95"
                >
                  <Hexagon className="h-3 w-3" />
                  Усилить ({cost})
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

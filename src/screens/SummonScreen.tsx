import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Gem, ScrollText, Sparkles, Star } from 'lucide-react';
import { playSfx } from '@/audio/sfx';
import { HeroRig } from '@/components/HeroRig';
import { SINGLE_SUMMON_GEMS, TEN_SUMMON_GEMS } from '@/game/gacha';
import { getHeroTemplate, RARITY_META } from '@/game/heroes';
import type { Rarity, SummonResultItem } from '@/game/types';
import { haptic } from '@/platform/telegram';
import { useGameStore } from '@/state/gameStore';

const RARITY_RANK: Record<Rarity, number> = {
  rare: 1,
  epic: 2,
  legendary: 3,
  mythic: 4,
};

export function SummonScreen() {
  const gems = useGameStore((s) => s.gems);
  const scrolls = useGameStore((s) => s.scrolls);
  const pityCounter = useGameStore((s) => s.pityCounter);
  const canFreeSummon = useGameStore((s) => s.canFreeSummon);
  const summonHeroes = useGameStore((s) => s.summonHeroes);
  const selectHero = useGameStore((s) => s.selectHero);
  const setActiveTab = useGameStore((s) => s.setActiveTab);

  const [portalCharging, setPortalCharging] = useState(false);
  const [beamColor, setBeamColor] = useState<string | null>(null);
  const [results, setResults] = useState<SummonResultItem[] | null>(null);

  const isFree = canFreeSummon();
  const canOne = isFree || scrolls >= 1 || gems >= SINGLE_SUMMON_GEMS;
  const canTen = scrolls >= 10 || gems >= TEN_SUMMON_GEMS;

  const triggerSummon = (count: 1 | 10) => {
    if (portalCharging) return;
    const pulled = summonHeroes(count);
    if (!pulled) return;

    let best: Rarity = 'rare';
    for (const item of pulled) {
      if (RARITY_RANK[item.rarity] > RARITY_RANK[best]) {
        best = item.rarity;
      }
    }

    const highlightColor = RARITY_META[best].color;
    setPortalCharging(true);
    setBeamColor(highlightColor);

    if (best === 'mythic' || best === 'legendary') {
      playSfx('summon_legend');
      haptic('heavy');
    } else {
      playSfx('summon_epic');
      haptic('medium');
    }

    window.setTimeout(() => {
      setPortalCharging(false);
      setResults(pulled);
    }, 360);
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-lg flex-col justify-between gap-2.5 overflow-y-auto px-3 py-2.5 custom-scroll">
      {/* Header & Scrolls Counter */}
      <div className="flex items-center justify-between rounded-2xl border border-purple-400/25 bg-slate-900/85 px-3.5 py-2">
        <div>
          <h2 className="text-sm font-black text-white">Портал Созвездий</h2>
          <p className="text-[10px] text-slate-300">
            Новые герои автоматически занимают свободные слоты отряда
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-xl border border-amber-400/35 bg-amber-500/15 px-2.5 py-1">
          <ScrollText className="h-4 w-4 text-amber-300" />
          <span className="text-xs font-black text-amber-100">{scrolls}</span>
        </div>
      </div>

      {/* Centerpiece Animated Astral Vortex */}
      <div className="relative flex min-h-[225px] flex-1 flex-col items-center justify-center overflow-hidden rounded-3xl border border-indigo-400/25 bg-[radial-gradient(circle_at_50%_50%,_#311068_0%,_#0b1026_64%,_#050712_100%)] p-4 shadow-2xl">
        {/* Flash Beam when summoning */}
        <AnimatePresence>
          {portalCharging && beamColor && (
            <motion.div
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: 0.95, scale: 2.2 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              style={{
                background: `radial-gradient(circle, #ffffff 0%, ${beamColor} 45%, transparent 72%)`,
              }}
              className="pointer-events-none absolute inset-0 z-20"
            />
          )}
        </AnimatePresence>

        {/* Outer Rotating Arcane Ring */}
        <motion.div
          animate={{ scale: portalCharging ? 1.32 : 1 }}
          transition={{ duration: 0.3 }}
          className="relative flex h-44 w-44 items-center justify-center"
        >
          <svg
            viewBox="0 0 200 200"
            className="absolute inset-0 h-full w-full animate-spin-slow opacity-85"
          >
            <circle
              cx="100"
              cy="100"
              r="90"
              fill="none"
              stroke="#a855f7"
              strokeWidth="2"
              strokeDasharray="14 8"
            />
            <polygon
              points="100,14 174,145 26,145"
              fill="none"
              stroke="#fbbf24"
              strokeWidth="1.4"
              opacity="0.7"
            />
            <polygon
              points="100,186 174,55 26,55"
              fill="none"
              stroke="#38bdf8"
              strokeWidth="1.4"
              opacity="0.7"
            />
          </svg>

          <svg
            viewBox="0 0 200 200"
            className="absolute inset-3 h-[calc(100%-24px)] w-[calc(100%-24px)] animate-spin-reverse opacity-90"
          >
            <circle
              cx="100"
              cy="100"
              r="76"
              fill="none"
              stroke="#f472b6"
              strokeWidth="2.5"
              strokeDasharray="6 10"
            />
          </svg>

          {/* Glowing Vortex Core */}
          <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full border-2 border-amber-300/60 bg-[radial-gradient(circle,_#fef08a_0%,_#a855f7_52%,_#1e1b4b_100%)] shadow-[0_0_40px_rgba(168,85,247,0.85)]">
            <Sparkles className="h-8 w-8 text-white drop-shadow animate-pulse" />
            <span className="mt-0.5 text-[9px] font-black uppercase tracking-widest text-white">
              Астрал
            </span>
          </div>
        </motion.div>

        {/* Pity Meter & Drop Rates */}
        <div className="mt-3 w-full max-w-xs space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-bold">
            <span className="text-amber-200">Гарант Легендарного / Мифического</span>
            <span className="font-black text-amber-300">{pityCounter} / 30</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-950/90 border border-white/10">
            <div
              style={{ width: `${Math.min(100, (pityCounter / 30) * 100)}%` }}
              className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-amber-400 transition-all duration-300"
            />
          </div>
          <div className="flex justify-between text-[9px] font-bold text-slate-300/85 pt-0.5">
            <span className="text-rose-300">UR Мифик: 5%</span>
            <span className="text-amber-300">SSR Легенда: 15%</span>
            <span className="text-purple-300">SR Эпик: 35%</span>
            <span className="text-sky-300">R: 45%</span>
          </div>
        </div>
      </div>

      {/* Summon x1 & x10 CTA Buttons */}
      <div className="grid grid-cols-2 gap-2.5 shrink-0">
        <button
          type="button"
          disabled={!canOne || portalCharging}
          onClick={() => {
            triggerSummon(1);
          }}
          className="flex flex-col items-center justify-center rounded-2xl border border-sky-400/45 bg-gradient-to-b from-slate-800 to-slate-900 px-3 py-3 text-white shadow-lg transition disabled:opacity-40 active:scale-95"
        >
          <span className="text-xs font-black">Призыв x1</span>
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-slate-950/80 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-300">
            {isFree ? (
              'БЕСПЛАТНО!'
            ) : scrolls >= 1 ? (
              <>
                <ScrollText className="h-3 w-3 text-amber-300" />1 Свиток
              </>
            ) : (
              <>
                <Gem className="h-3 w-3 text-fuchsia-400" />
                {SINGLE_SUMMON_GEMS}
              </>
            )}
          </span>
        </button>

        <button
          type="button"
          disabled={!canTen || portalCharging}
          onClick={() => {
            triggerSummon(10);
          }}
          className="btn-gloss flex flex-col items-center justify-center rounded-2xl border border-amber-300/70 bg-gradient-to-b from-amber-400 via-orange-500 to-rose-600 px-3 py-3 text-slate-950 shadow-xl shadow-orange-500/25 transition disabled:opacity-40 active:scale-95"
        >
          <span className="text-xs font-black text-white drop-shadow">
            Призыв x10 (SR+)
          </span>
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-slate-950/80 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-300">
            {scrolls >= 10 ? (
              <>
                <ScrollText className="h-3 w-3 text-amber-300" />
                10 Свитков
              </>
            ) : (
              <>
                <Gem className="h-3 w-3 text-fuchsia-400" />
                {TEN_SUMMON_GEMS} (-20%)
              </>
            )}
          </span>
        </button>
      </div>

      {/* Summon Results Cinematic Overlay */}
      <AnimatePresence>
        {results && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto bg-slate-950/92 p-3 backdrop-blur-md"
          >
            <div className="w-full max-w-md">
              <div className="mb-3 text-center">
                <div className="text-xs font-bold uppercase tracking-widest text-amber-300">
                  Дары Созвездий
                </div>
                <h3 className="text-lg font-black text-white">
                  Призвано героев: {results.length}
                </h3>
              </div>

              <div
                className={`grid gap-2 ${
                  results.length === 1 ? 'grid-cols-1 max-w-[200px] mx-auto' : 'grid-cols-5'
                }`}
              >
                {results.map((item, idx) => {
                  const hero = getHeroTemplate(item.heroId);
                  const rMeta = RARITY_META[item.rarity];
                  const isHigh = item.rarity === 'legendary' || item.rarity === 'mythic';

                  return (
                    <motion.div
                      key={`${item.heroId}_${idx}`}
                      initial={{ opacity: 0, scale: 0.45, rotateY: 90 }}
                      animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                      transition={{
                        delay: idx * 0.055,
                        type: 'spring',
                        stiffness: 380,
                        damping: 22,
                      }}
                      onClick={() => {
                        selectHero(item.heroId);
                        setResults(null);
                        setActiveTab('heroes');
                      }}
                      style={{
                        borderColor: rMeta.color,
                        boxShadow: isHigh ? `0 0 22px ${rMeta.color}66` : undefined,
                      }}
                      className="relative flex flex-col items-center rounded-2xl border-2 bg-slate-900/95 p-1.5 text-center cursor-pointer active:scale-95"
                    >
                      <span
                        style={{ backgroundColor: rMeta.color }}
                        className="self-start rounded px-1 py-0.2 text-[8px] font-black text-slate-950"
                      >
                        {rMeta.badge}
                      </span>

                      <HeroRig
                        visual={hero.visual}
                        size={results.length === 1 ? 110 : 54}
                        stars={rMeta.baseStars}
                        energyReady={isHigh}
                      />

                      <div className="w-full truncate text-[10px] font-black text-white">
                        {hero.name}
                      </div>

                      {item.isNew ? (
                        <span className="mt-0.5 rounded bg-emerald-500/25 px-1 text-[8px] font-extrabold text-emerald-300">
                          НОВЫЙ!
                        </span>
                      ) : (
                        <span className="mt-0.5 inline-flex items-center gap-0.5 text-[8px] font-bold text-amber-300">
                          <Star className="h-2.5 w-2.5 fill-current" />+{item.shardsGranted}
                        </span>
                      )}
                    </motion.div>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    playSfx('tap');
                    setResults(null);
                  }}
                  className="rounded-xl border border-white/15 bg-slate-800 px-5 py-2.5 text-xs font-black text-white active:scale-95"
                >
                  Продолжить
                </button>
                {canTen && (
                  <button
                    type="button"
                    onClick={() => {
                      triggerSummon(10);
                    }}
                    className="btn-gloss rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-2.5 text-xs font-black text-slate-950 shadow-lg active:scale-95"
                  >
                    Ещё x10!
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

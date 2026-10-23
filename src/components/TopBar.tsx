import { useState } from 'react';
import { Coins, Flame, Gem, RotateCcw, ShieldAlert, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { playSfx } from '@/audio/sfx';
import { computeFactionAura, computeHeroStats, formatCompactNumber } from '@/game/heroes';
import { useGameStore } from '@/state/gameStore';

export function TopBar() {
  const gold = useGameStore((s) => s.gold);
  const essence = useGameStore((s) => s.essence);
  const gems = useGameStore((s) => s.gems);
  const ownedHeroes = useGameStore((s) => s.ownedHeroes);
  const lineup = useGameStore((s) => s.lineup);
  const relics = useGameStore((s) => s.relics);
  const soundOn = useGameStore((s) => s.soundOn);
  const toggleSound = useGameStore((s) => s.toggleSound);
  const resetSave = useGameStore((s) => s.resetSave);
  const setActiveTab = useGameStore((s) => s.setActiveTab);

  const [confirmReset, setConfirmReset] = useState(false);

  const aura = computeFactionAura(lineup);
  const squadPower = lineup.reduce((acc, heroId) => {
    if (!heroId) return acc;
    const owned = ownedHeroes[heroId];
    if (!owned) return acc;
    return acc + computeHeroStats(owned, relics, aura).power;
  }, 0);

  return (
    <>
      <header
        style={{ paddingTop: 'max(6px, var(--safe-top))' }}
        className="relative z-30 shrink-0 border-b border-white/10 bg-slate-950/85 px-3 pb-2 backdrop-blur-md"
      >
        <div className="mx-auto flex max-w-lg items-center justify-between gap-1.5">
          {/* Squad Power Badge */}
          <button
            type="button"
            onClick={() => {
              playSfx('tap');
              setActiveTab('squad');
            }}
            className="flex items-center gap-1.5 rounded-xl border border-amber-400/35 bg-gradient-to-r from-amber-500/20 to-orange-500/10 px-2.5 py-1 text-left transition active:scale-95"
          >
            <Flame className="h-4 w-4 text-amber-400 shrink-0" />
            <div>
              <div className="text-[9px] font-bold uppercase leading-none tracking-wider text-amber-300/80">
                Мощь
              </div>
              <div className="text-xs font-black leading-tight text-amber-200">
                {formatCompactNumber(squadPower)}
              </div>
            </div>
          </button>

          {/* Resources Strip */}
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-slate-900/90 px-2 py-1">
              <Coins className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span className="text-xs font-extrabold text-amber-100">{formatCompactNumber(gold)}</span>
            </div>

            <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-slate-900/90 px-2 py-1">
              <Sparkles className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span className="text-xs font-extrabold text-emerald-100">{formatCompactNumber(essence)}</span>
            </div>

            <button
              type="button"
              onClick={() => {
                playSfx('tap');
                setActiveTab('summon');
              }}
              className="flex items-center gap-1 rounded-lg border border-fuchsia-400/35 bg-fuchsia-950/50 px-2 py-1 transition active:scale-95"
            >
              <Gem className="h-3.5 w-3.5 text-fuchsia-400 shrink-0" />
              <span className="text-xs font-extrabold text-fuchsia-100">{formatCompactNumber(gems)}</span>
            </button>
          </div>

          {/* Utility Buttons */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Переключить звук"
              onClick={toggleSound}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-slate-900/80 text-slate-300 transition hover:text-white active:scale-90"
            >
              {soundOn ? <Volume2 className="h-3.5 w-3.5 text-sky-400" /> : <VolumeX className="h-3.5 w-3.5 text-slate-500" />}
            </button>
            <button
              type="button"
              aria-label="Сброс прогресса"
              onClick={() => {
                playSfx('tap');
                setConfirmReset(true);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-slate-900/80 text-slate-400 transition hover:text-rose-300 active:scale-90"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      {confirmReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-2xl border border-white/15 bg-slate-900 p-4 text-center shadow-2xl">
            <ShieldAlert className="mx-auto mb-2 h-8 w-8 text-rose-400" />
            <h3 className="text-base font-black text-white">Начать заново?</h3>
            <p className="mt-1 text-xs text-slate-300">
              Текущий прогресс героев и этапов будет сброшен до начального состояния.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmReset(false);
                }}
                className="rounded-xl border border-white/15 bg-slate-800 py-2 text-xs font-bold text-slate-200"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  resetSave();
                  setConfirmReset(false);
                }}
                className="rounded-xl bg-rose-600 py-2 text-xs font-bold text-white"
              >
                Сбросить
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

import type { ReactElement } from 'react';
import { motion } from 'framer-motion';
import { ROSTER } from '@/characters/roster';
import { useGame } from '@/state/store';
import type { QualityChoice } from '@/render/stage';
import { sfx } from '@/audio/sfx';
import { isTelegram, playerIdentity } from '@/platform/telegram';
import { Portrait } from './Portrait';

const QUALITY_ORDER: readonly QualityChoice[] = ['auto', 'high', 'medium', 'low'];
const QUALITY_LABEL: Readonly<Record<QualityChoice, string>> = {
  auto: 'авто',
  high: 'макс',
  medium: 'средне',
  low: 'эконом',
};

export function MenuScreen(): ReactElement {
  const setScreen = useGame((state) => state.setScreen);
  const sound = useGame((state) => state.sound);
  const toggleSound = useGame((state) => state.toggleSound);
  const quality = useGame((state) => state.quality);
  const setQuality = useGame((state) => state.setQuality);
  const wins = useGame((state) => state.wins);
  const fights = useGame((state) => state.fights);

  const identity = playerIdentity();
  const nextQuality = QUALITY_ORDER[(QUALITY_ORDER.indexOf(quality) + 1) % QUALITY_ORDER.length] ?? 'auto';

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-ink">
      {/* Backdrop: layered rust, acid light and a slow drifting haze. */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 top-[-10%] h-[70%] w-[60%] rounded-full bg-rust/30 blur-[90px]" />
        <div className="absolute -right-24 bottom-[-20%] h-[80%] w-[55%] rounded-full bg-acid/10 blur-[100px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_120%,rgba(193,55,42,0.25),transparent_60%)]" />
        <div className="grain absolute inset-0 opacity-[0.14]" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink to-transparent" />
      </div>

      <div className="relative flex flex-1 flex-col justify-between px-5 pb-[max(14px,env(safe-area-inset-bottom))] pt-[max(14px,env(safe-area-inset-top))] sm:px-10">
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.4em] text-acid/70">подпольный турнир уродов</div>
            <motion.h1
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28 }}
              className="mt-1 font-display text-[clamp(38px,9vw,76px)] leading-[0.85] tracking-[-0.02em] text-bone drop-shadow-[0_6px_0_rgba(141,47,31,0.85)]"
            >
              FREAK<span className="text-blood">PIT</span>
            </motion.h1>
            <div className="mt-2 max-w-[42ch] text-[13px] leading-snug text-bone/55">
              Затопленный карьер. Четыре урода. Один выход — через чужую челюсть.
            </div>
          </div>

          <div className="hidden h-20 shrink-0 items-end gap-1 sm:flex">
            {ROSTER.map((character) => (
              <Portrait key={character.id} def={character} className="h-full w-auto opacity-80" />
            ))}
          </div>
        </header>

        <main className="mt-3 flex flex-1 items-center">
          <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onPointerDown={() => {
                  sfx.unlock();
                  sfx.play('select');
                }}
                onClick={() => { setScreen('select'); }}
                data-testid="menu-start"
                className="group relative min-h-[64px] w-full min-w-[240px] overflow-hidden rounded-md border-2 border-blood/70 bg-gradient-to-b from-blood/40 to-black/70 px-8 font-display text-[24px] uppercase tracking-[0.14em] text-bone shadow-[0_6px_0_rgba(0,0,0,0.7)] active:translate-y-[2px] active:shadow-[0_3px_0_rgba(0,0,0,0.7)] sm:w-[320px]"
              >
                <span className="relative z-10">в яму</span>
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-bone/15 to-transparent opacity-0 transition-opacity duration-200 group-active:opacity-100" />
              </button>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    sfx.unlock();
                    sfx.play('ui');
                    toggleSound();
                  }}
                  className="min-h-[52px] flex-1 rounded-md border border-bone/20 bg-black/40 px-4 font-display text-[14px] uppercase tracking-[0.14em] text-bone/70 active:bg-bone/10"
                >
                  звук · {sound ? 'вкл' : 'выкл'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sfx.unlock();
                    sfx.play('ui');
                    setQuality(nextQuality);
                  }}
                  className="min-h-[52px] flex-1 rounded-md border border-bone/20 bg-black/40 px-4 font-display text-[14px] uppercase tracking-[0.14em] text-bone/70 active:bg-bone/10"
                >
                  графика · {QUALITY_LABEL[quality]}
                </button>
              </div>
            </div>

            <div className="flex flex-col items-start gap-1 text-[12px] uppercase tracking-[0.18em] text-bone/40 sm:items-end">
              <div>
                боец: <span className="text-bone/80">{identity.name}</span>
              </div>
              <div>
                боёв: <span className="text-bone/70">{fights}</span> · побед: <span className="text-acid/90">{wins}</span>
              </div>
              <div className="text-[10px] text-bone/25">{isTelegram() ? 'telegram mini app' : 'браузер · демо'}</div>
            </div>
          </div>
        </main>

        <footer className="mt-3 flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.22em] text-bone/25">
          <span>телефон · горизонтально · два больших пальца</span>
          <span className="hidden sm:inline">v0.1 · прототип</span>
        </footer>
      </div>
    </div>
  );
}

import type { ReactElement } from 'react';
import { motion } from 'framer-motion';
import { characterById } from '@/characters/roster';
import { useGame } from '@/state/store';
import { sfx } from '@/audio/sfx';
import { Portrait } from './Portrait';

function Stat({ label, value }: { label: string; value: string | number }): ReactElement {
  return (
    <div className="rounded border border-bone/10 bg-black/40 px-3 py-2">
      <div className="text-[9px] uppercase tracking-[0.2em] text-bone/35">{label}</div>
      <div className="font-display text-[20px] leading-none text-bone/90">{value}</div>
    </div>
  );
}

export function ResultScreen(): ReactElement {
  const result = useGame((state) => state.result);
  const setScreen = useGame((state) => state.setScreen);
  const rematch = useGame((state) => state.rematch);

  if (!result) {
    // Defensive: the result screen is only reachable through a finished match.
    return (
      <div className="flex h-full items-center justify-center bg-ink">
        <button
          type="button"
          onClick={() => { setScreen('menu'); }}
          className="min-h-[56px] rounded border border-bone/20 px-6 font-display uppercase text-bone"
        >
          в меню
        </button>
      </div>
    );
  }

  const player = characterById(result.playerId);
  const opponent = characterById(result.opponentId);
  const done = result.victory;

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-ink">
      <div className="pointer-events-none absolute inset-0">
        <div
          className={`absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,${
            done ? 'rgba(182,224,74,0.22)' : 'rgba(193,55,42,0.25)'
          },transparent_60%)]`}
        />
        <div className="grain absolute inset-0 opacity-[0.12]" />
      </div>

      <div className="relative flex h-full flex-col items-center justify-center gap-3 px-5 pb-[max(12px,env(safe-area-inset-bottom))] pt-[max(12px,env(safe-area-inset-top))]">
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
          className="flex items-center gap-5"
        >
          <Portrait def={result.victory ? player : opponent} className="h-[112px] w-auto drop-shadow-[0_8px_20px_rgba(0,0,0,0.8)]" />
          <div>
            <div className="text-[10px] uppercase tracking-[0.32em] text-bone/40">
              {player.name} против {opponent.name}
            </div>
            <div className={`font-display text-[clamp(34px,8vw,62px)] leading-[0.9] tracking-[0.02em] ${done ? 'text-acid' : 'text-blood'}`}>
              {done ? 'ЯМА ТВОЯ' : 'ТЕБЯ СЪЕЛИ'}
            </div>
            <div className="mt-1 text-[12px] uppercase tracking-[0.2em] text-bone/45">
              раунды {result.rounds[0]} : {result.rounds[1]}
            </div>
          </div>
          <Portrait def={result.victory ? opponent : player} dim className="h-[92px] w-auto opacity-60" />
        </motion.div>

        <div className="mt-1 grid w-full max-w-[520px] grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="удары" value={result.hits} />
          <Stat label="блоки" value={result.blocks} />
          <Stat label="комбо" value={`×${result.maxCombo}`} />
          <Stat label="урон" value={result.damageDealt} />
        </div>

        <div className="mt-2 flex w-full max-w-[520px] flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => {
              sfx.play('select');
              rematch();
            }}
            className="min-h-[56px] flex-1 rounded-md border-2 border-blood/70 bg-gradient-to-b from-blood/45 to-black/60 px-5 font-display text-[16px] uppercase tracking-[0.14em] text-bone active:translate-y-[2px]"
          >
            ещё раз
          </button>
          <button
            type="button"
            onClick={() => {
              sfx.play('ui');
              setScreen('select');
            }}
            className="min-h-[56px] flex-1 rounded-md border border-bone/25 bg-black/45 px-5 font-display text-[15px] uppercase tracking-[0.14em] text-bone/75 active:bg-bone/10"
          >
            другой урод
          </button>
          <button
            type="button"
            onClick={() => {
              sfx.play('back');
              setScreen('menu');
            }}
            className="min-h-[56px] flex-1 rounded-md border border-bone/20 bg-black/35 px-5 font-display text-[15px] uppercase tracking-[0.14em] text-bone/55 active:bg-bone/10"
          >
            в меню
          </button>
        </div>
      </div>
    </div>
  );
}

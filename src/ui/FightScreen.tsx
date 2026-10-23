import { useState } from 'react';
import type { ReactElement } from 'react';
import { motion } from 'framer-motion';
import { characterById } from '@/characters/roster';
import { useGame } from '@/state/store';
import { useFight } from '@/game/useFight';
import { sfx } from '@/audio/sfx';
import { Hud } from './Hud';
import { TouchControls } from './TouchControls';

/**
 * The match screen: canvas, HUD, thumb controls and the pause sheet.
 * Everything gameplay-related is delegated to `useFight`.
 */
export function FightScreen(): ReactElement {
  const fighterId = useGame((state) => state.fighterId);
  const opponentId = useGame((state) => state.opponentId);
  const difficulty = useGame((state) => state.difficulty);
  const quality = useGame((state) => state.quality);
  const sound = useGame((state) => state.sound);
  const toggleSound = useGame((state) => state.toggleSound);
  const setScreen = useGame((state) => state.setScreen);
  const finishMatch = useGame((state) => state.finishMatch);

  const player = characterById(fighterId);
  const opponent = characterById(opponentId);

  const fight = useFight({
    player,
    opponent,
    difficulty,
    quality,
    sound,
    onFinish: ({ victory, rounds, stats, durationSeconds }) => {
      finishMatch({
        victory,
        playerId: player.id,
        opponentId: opponent.id,
        rounds,
        hits: stats.hits,
        blocks: stats.blocks,
        maxCombo: stats.maxCombo,
        damageDealt: stats.damageDealt,
        durationSeconds,
      });
    },
  });

  const [confirmQuit, setConfirmQuit] = useState(false);

  return (
    <div className="relative h-full w-full overflow-hidden bg-ink">
      <canvas ref={fight.canvasRef} data-testid="fight-canvas" className="absolute inset-0 h-full w-full touch-none" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.55)_100%)]" />

      {fight.error ? (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-ink/90 px-8 text-center">
          <div className="font-display text-[26px] uppercase text-blood">3D не запустилось</div>
          <div className="max-w-[34ch] text-[14px] leading-snug text-bone/60">{fight.error}</div>
          <button
            type="button"
            onClick={() => {
              setScreen('menu');
            }}
            className="min-h-[56px] rounded-md border border-bone/25 bg-black/50 px-6 font-display text-[15px] uppercase text-bone/80"
          >
            в меню
          </button>
        </div>
      ) : (
        <>
          {fight.hud && (
            <Hud
              snapshot={fight.hud}
              player={player}
              opponent={opponent}
              onPause={() => {
                fight.setPaused(true);
              }}
            />
          )}
          <TouchControls controls={fight.controls} snapshot={fight.hud} />
        </>
      )}

      {fight.paused && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-ink/85 px-6 backdrop-blur-sm"
        >
          <div className="font-display text-[34px] leading-none tracking-[0.1em] text-bone">ПАУЗА</div>
          <div className="text-[13px] uppercase tracking-[0.22em] text-bone/40">{player.name} против {opponent.name}</div>

          <div className="mt-2 flex w-full max-w-[420px] flex-col gap-3">
            <button
              type="button"
              onClick={() => {
                sfx.play('ui');
                fight.setPaused(false);
              }}
              data-testid="pause-resume"
              className="min-h-[56px] rounded-md border border-acid/50 bg-acid/15 px-6 font-display text-[18px] uppercase tracking-wider text-acid active:bg-acid/30"
            >
              продолжить
            </button>
            <button
              type="button"
              onClick={() => {
                sfx.play('ui');
                toggleSound();
              }}
              className="min-h-[56px] rounded-md border border-bone/25 bg-black/50 px-6 font-display text-[16px] uppercase tracking-wider text-bone/80 active:bg-bone/10"
            >
              звук: {sound ? 'вкл' : 'выкл'}
            </button>
            {confirmQuit ? (
              <button
                type="button"
                onClick={() => {
                  sfx.play('back');
                  setScreen('menu');
                }}
                className="min-h-[56px] rounded-md border border-blood/60 bg-blood/20 px-6 font-display text-[16px] uppercase tracking-wider text-blood active:bg-blood/35"
              >
                точно выйти в меню?
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  sfx.play('back');
                  setConfirmQuit(true);
                }}
                className="min-h-[56px] rounded-md border border-bone/20 bg-black/40 px-6 font-display text-[16px] uppercase tracking-wider text-bone/60 active:bg-bone/10"
              >
                выйти в меню
              </button>
            )}
          </div>

          <div className="mt-2 text-center text-[11px] uppercase tracking-[0.2em] text-bone/30">
            качество: {fight.quality} · сложность: {difficulty}
          </div>
        </motion.div>
      )}
    </div>
  );
}

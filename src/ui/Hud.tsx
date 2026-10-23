import type { ReactElement } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { BattleSnapshot, CharacterDef, FighterSnapshot } from '@/fight/types';

interface HudProps {
  readonly snapshot: BattleSnapshot;
  readonly player: CharacterDef;
  readonly opponent: CharacterDef;
  readonly onPause: () => void;
}

function HealthBar({ fighter, mirrored }: { fighter: FighterSnapshot; mirrored: boolean }): ReactElement {
  const ratio = Math.max(0, Math.min(1, fighter.hp / fighter.maxHp));
  const low = ratio < 0.25;
  return (
    <div className="h-[14px] w-full overflow-hidden rounded-sm border border-bone/25 bg-black/70 shadow-[inset_0_2px_6px_rgba(0,0,0,0.9)]">
      <div
        className={`h-full transition-[width] duration-200 ease-out ${low ? 'bg-blood' : 'bg-gradient-to-b from-acid/90 via-acid/70 to-acid/40'}`}
        style={{ width: `${ratio * 100}%`, marginLeft: mirrored ? 'auto' : undefined }}
      />
    </div>
  );
}

function Meter({ fighter, mirrored }: { fighter: FighterSnapshot; mirrored: boolean }): ReactElement {
  const bars = [0, 1, 2];
  return (
    <div className={`mt-1 flex gap-1 ${mirrored ? 'flex-row-reverse' : ''}`}>
      {bars.map((bar) => {
        const fill = Math.max(0, Math.min(1, (fighter.meter - bar * 100) / 100));
        return (
          <div key={bar} className="h-[7px] flex-1 overflow-hidden rounded-[1px] border border-bone/20 bg-black/60">
            <div
              className={`h-full transition-[width] duration-150 ${fill >= 1 ? 'bg-gradient-to-r from-ember to-acid' : 'bg-ember/80'}`}
              style={{ width: `${fill * 100}%`, marginLeft: mirrored ? 'auto' : undefined }}
            />
          </div>
        );
      })}
    </div>
  );
}

function Pips({ fighter, mirrored }: { fighter: FighterSnapshot; mirrored: boolean }): ReactElement {
  return (
    <div className={`mt-1 flex gap-1 ${mirrored ? 'flex-row-reverse' : ''}`}>
      {[0, 1].map((pip) => (
        <span
          key={pip}
          className={`h-2 w-4 rounded-[1px] border ${pip < fighter.roundsWon ? 'border-ember bg-ember' : 'border-bone/25 bg-black/60'}`}
        />
      ))}
    </div>
  );
}

function bannerFor(snapshot: BattleSnapshot): { key: string; text: string; tone: 'neutral' | 'hot' | 'win' } | null {
  switch (snapshot.phase) {
    case 'intro':
      return snapshot.phaseTicks < 62
        ? { key: `round-${snapshot.round}`, text: `РАУНД ${snapshot.round}`, tone: 'neutral' }
        : { key: 'fight', text: 'В ЯМУ!', tone: 'hot' };
    case 'ko':
      return { key: 'ko', text: snapshot.fighters[0].hp <= 0 || snapshot.fighters[1].hp <= 0 ? 'НОКАУТ' : 'ВРЕМЯ', tone: 'hot' };
    case 'roundOver':
      return { key: `round-end-${snapshot.round}`, text: 'РАУНД ВЗЯТ', tone: 'neutral' };
    case 'matchOver':
      return snapshot.winner === 0 ? { key: 'win', text: 'ПОБЕДА', tone: 'win' } : { key: 'lose', text: 'ТЫ МЯСО', tone: 'hot' };
    default:
      return null;
  }
}

export function Hud({ snapshot, player, opponent, onPause }: HudProps): ReactElement {
  const [left, right] = snapshot.fighters;
  const banner = bannerFor(snapshot);
  const combo = left.combo >= 2 ? left.combo : 0;

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      <div className="absolute inset-x-0 top-0 px-3 pt-[max(6px,env(safe-area-inset-top))]">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-baseline gap-2">
              <span className="truncate font-display text-[15px] leading-none tracking-wide text-bone">{player.name}</span>
              <span className="text-[11px] uppercase tracking-[0.2em] text-bone/40">ты</span>
            </div>
            <HealthBar fighter={left} mirrored={false} />
            <Meter fighter={left} mirrored={false} />
            <Pips fighter={left} mirrored={false} />
          </div>

          <div className="flex shrink-0 flex-col items-center gap-1">
            <div className="flex items-center gap-2">
              <div data-testid="hud-timer" className="rounded-md border border-bone/20 bg-black/70 px-2 py-0.5 font-display text-[26px] leading-none text-bone tabular-nums">
                {String(snapshot.timer).padStart(2, '0')}
              </div>
              <button
                type="button"
                aria-label="Пауза"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onPause();
                }}
                className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border border-bone/25 bg-black/60 text-bone/80 active:bg-bone/20"
              >
                <span className="block h-4 w-3 border-x-[3px] border-current" />
              </button>
            </div>
            <div className="rounded bg-black/50 px-2 py-[1px] text-[10px] uppercase tracking-[0.18em] text-bone/45">
              раунд {snapshot.round} · до 2
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-baseline justify-end gap-2">
              <span className="text-[11px] uppercase tracking-[0.2em] text-bone/40">враг</span>
              <span className="truncate font-display text-[15px] leading-none tracking-wide text-bone">{opponent.name}</span>
            </div>
            <HealthBar fighter={right} mirrored />
            <Meter fighter={right} mirrored />
            <Pips fighter={right} mirrored />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {combo > 0 && (
          <motion.div
            key="combo"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="absolute left-4 top-[38%]"
          >
            <div className="font-display text-[34px] leading-none text-ember drop-shadow-[0_3px_0_rgba(0,0,0,0.8)]">{combo}</div>
            <div className="text-[11px] uppercase tracking-[0.25em] text-bone/70">хитов</div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {banner && (
          <motion.div
            key={banner.key}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <div
              className={`rounded-md border-y-2 bg-black/45 px-6 py-2 font-display text-[38px] leading-none tracking-[0.08em] backdrop-blur-[2px] ${
                banner.tone === 'hot'
                  ? 'border-blood text-blood'
                  : banner.tone === 'win'
                    ? 'border-acid text-acid'
                    : 'border-bone/50 text-bone'
              }`}
            >
              {banner.text}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

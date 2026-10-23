import type { ReactElement } from 'react';
import { ROSTER, characterById } from '@/characters/roster';
import { useGame, suggestOpponent } from '@/state/store';
import type { Difficulty } from '@/fight/ai';
import { sfx } from '@/audio/sfx';
import { Portrait } from './Portrait';

const DIFFICULTIES: readonly { id: Difficulty; label: string; note: string }[] = [
  { id: 'easy', label: 'мясо', note: 'медленно думает' },
  { id: 'normal', label: 'урод', note: 'блокирует иногда' },
  { id: 'hard', label: 'мясник', note: 'наказывает за промах' },
];

function StatBar({ label, value }: { label: string; value: number }): ReactElement {
  return (
    <div className="flex items-center gap-2">
      <span className="w-9 text-[9px] uppercase tracking-[0.18em] text-bone/40">{label}</span>
      <div className="flex flex-1 gap-[3px]">
        {[0, 1, 2, 3, 4].map((slot) => (
          <span
            key={slot}
            className={`h-[6px] flex-1 rounded-[1px] ${slot < value ? 'bg-acid/80' : 'bg-bone/10'}`}
          />
        ))}
      </div>
    </div>
  );
}

export function SelectScreen(): ReactElement {
  const fighterId = useGame((state) => state.fighterId);
  const difficulty = useGame((state) => state.difficulty);
  const setFighter = useGame((state) => state.setFighter);
  const setOpponent = useGame((state) => state.setOpponent);
  const setDifficulty = useGame((state) => state.setDifficulty);
  const setScreen = useGame((state) => state.setScreen);

  const selected = characterById(fighterId);
  const opponentId = useGame((state) => state.opponentId);
  const opponent = characterById(opponentId);

  const start = (): void => {
    sfx.unlock();
    sfx.play('select');
    setOpponent(suggestOpponent(selected.id));
    setScreen('fight');
  };

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-ink">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[120%] w-[120%] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(circle_at_50%_40%,rgba(141,47,31,0.35),transparent_55%)]" />
        <div className="grain absolute inset-0 opacity-[0.12]" />
      </div>

      <div className="relative flex h-full flex-col px-4 pb-[max(10px,env(safe-area-inset-bottom))] pt-[max(10px,env(safe-area-inset-top))] sm:px-8">
        <header className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              sfx.play('back');
              setScreen('menu');
            }}
            className="min-h-[48px] rounded-md border border-bone/20 bg-black/40 px-4 font-display text-[13px] uppercase tracking-[0.16em] text-bone/60 active:bg-bone/10"
          >
            назад
          </button>
          <h2 className="font-display text-[clamp(20px,4.5vw,30px)] uppercase leading-none tracking-[0.1em] text-bone">
            выбери <span className="text-blood">урода</span>
          </h2>
          <div className="min-w-[60px] text-right text-[10px] uppercase tracking-[0.2em] text-bone/30">
            {ROSTER.indexOf(selected) + 1}/{ROSTER.length}
          </div>
        </header>

        <div className="mt-3 flex min-h-0 flex-1 gap-3">
          {/* Roster column */}
          <div className="grid w-[46%] max-w-[430px] shrink-0 grid-cols-2 gap-2 overflow-y-auto pb-1">
            {ROSTER.map((character) => {
              const active = character.id === selected.id;
              return (
                <button
                  key={character.id}
                  type="button"
                  onClick={() => {
                    sfx.play('ui');
                    setFighter(character.id);
                  }}
                  className={`relative flex min-h-[86px] flex-col items-start justify-between overflow-hidden rounded-md border px-2.5 py-2 text-left transition-colors duration-150 ${
                    active ? 'border-blood bg-blood/20' : 'border-bone/15 bg-black/40 active:bg-bone/10'
                  }`}
                >
                  <span className={`font-display text-[15px] leading-none tracking-wide ${active ? 'text-bone' : 'text-bone/75'}`}>
                    {character.name}
                  </span>
                  <span className="text-[9px] uppercase tracking-[0.16em] text-bone/40">{character.title}</span>
                  <Portrait def={character} dim={!active} className="pointer-events-none absolute -right-3 -top-2 h-[84px] w-auto opacity-60" />
                  {active && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-acid" />}
                </button>
              );
            })}
          </div>

          {/* Detail panel */}
          <div className="flex min-w-0 flex-1 flex-col rounded-md border border-bone/15 bg-black/45 p-3">
            <div className="flex min-h-0 flex-1 gap-3">
              <div className="relative flex w-[34%] min-w-[92px] items-end justify-center">
                <div className="absolute inset-x-0 bottom-0 h-2/3 bg-[radial-gradient(ellipse_at_bottom,rgba(182,224,74,0.18),transparent_70%)]" />
                <Portrait def={selected} className="relative h-full w-auto max-h-[190px] drop-shadow-[0_10px_24px_rgba(0,0,0,0.7)]" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="font-display text-[clamp(18px,3.6vw,26px)] leading-none text-bone">{selected.name}</div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-acid/70">{selected.title}</div>
                <p className="mt-2 line-clamp-4 text-[12px] leading-snug text-bone/55">{selected.lore}</p>

                <div className="mt-auto flex flex-col gap-1.5 pt-2">
                  <StatBar label="сила" value={selected.power} />
                  <StatBar label="скор" value={selected.speed} />
                  <StatBar label="даль" value={selected.range} />
                </div>
              </div>
            </div>

            <div className="mt-2 border-t border-bone/10 pt-2">
              <div className="mb-1.5 text-[9px] uppercase tracking-[0.24em] text-bone/35">соперник · {opponent.name}</div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {ROSTER.filter((character) => character.id !== selected.id).map((character) => (
                  <button
                    key={character.id}
                    type="button"
                    onClick={() => {
                      sfx.play('ui');
                      setOpponent(character.id);
                    }}
                    className={`min-h-[44px] shrink-0 rounded border px-3 font-display text-[11px] uppercase tracking-[0.12em] ${
                      character.id === opponent.id ? 'border-ember/70 bg-ember/15 text-ember' : 'border-bone/15 bg-black/30 text-bone/50'
                    }`}
                  >
                    {character.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <footer className="mt-2 flex items-center gap-2">
          <div className="flex min-w-0 flex-1 gap-2">
            {DIFFICULTIES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => {
                  sfx.play('ui');
                  setDifficulty(entry.id);
                }}
                className={`flex min-h-[48px] min-w-0 flex-1 flex-col items-start justify-center rounded border px-2.5 py-1 text-left ${
                  difficulty === entry.id ? 'border-acid/60 bg-acid/10' : 'border-bone/15 bg-black/40'
                }`}
              >
                <span className={`font-display text-[13px] uppercase leading-none tracking-[0.1em] ${difficulty === entry.id ? 'text-acid' : 'text-bone/60'}`}>
                  {entry.label}
                </span>
                <span className="mt-[2px] truncate text-[9px] uppercase tracking-[0.12em] text-bone/30">{entry.note}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={start}
            data-testid="select-start"
            className="min-h-[56px] shrink-0 rounded-md border-2 border-blood/70 bg-gradient-to-b from-blood/50 to-black/60 px-6 font-display text-[18px] uppercase tracking-[0.14em] text-bone shadow-[0_5px_0_rgba(0,0,0,0.6)] active:translate-y-[2px] active:shadow-[0_2px_0_rgba(0,0,0,0.6)]"
          >
            драться
          </button>
        </footer>
      </div>
    </div>
  );
}

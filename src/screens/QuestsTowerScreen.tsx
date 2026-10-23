import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Award,
  CheckCircle2,
  Coins,
  Crown,
  Gem,
  Hexagon,
  ScrollText,
  Swords,
} from 'lucide-react';
import { playSfx } from '@/audio/sfx';
import { HeroRig } from '@/components/HeroRig';
import { buildAllyUnits, simulateFullBattle } from '@/game/combat';
import {
  computeFactionAura,
  computeHeroStats,
  formatCompactNumber,
  QUEST_DEFINITIONS,
} from '@/game/heroes';
import { buildTowerFloor } from '@/game/stages';
import { haptic } from '@/platform/telegram';
import { useGameStore } from '@/state/gameStore';

export function QuestsTowerScreen() {
  const towerFloor = useGameStore((s) => s.towerFloor);
  const lineup = useGameStore((s) => s.lineup);
  const ownedHeroes = useGameStore((s) => s.ownedHeroes);
  const relics = useGameStore((s) => s.relics);
  const totalKills = useGameStore((s) => s.totalKills);
  const maxStage = useGameStore((s) => s.maxStage);
  const totalSummons = useGameStore((s) => s.totalSummons);
  const claimedQuests = useGameStore((s) => s.claimedQuests);

  const completeTowerVictory = useGameStore((s) => s.completeTowerVictory);
  const claimQuest = useGameStore((s) => s.claimQuest);

  const [subTab, setSubTab] = useState<'tower' | 'quests'>('tower');
  const [towerMessage, setTowerMessage] = useState<string | null>(null);
  const [fighting, setFighting] = useState(false);

  const floorDef = buildTowerFloor(towerFloor);
  const bossUnit = floorDef.enemies.find((e) => e.isBoss) ?? floorDef.enemies[0];

  const aura = computeFactionAura(lineup);
  const squadPower = lineup.reduce((acc, heroId) => {
    if (!heroId) return acc;
    const owned = ownedHeroes[heroId];
    return owned ? acc + computeHeroStats(owned, relics, aura).power : acc;
  }, 0);

  const highestHeroLevel = Object.values(ownedHeroes).reduce((m, h) => Math.max(m, h.level), 1);
  const statMap = { totalKills, maxStage, totalSummons, highestHeroLevel, towerFloor };

  const readyQuestCount = QUEST_DEFINITIONS.filter(
    (q) => !claimedQuests.includes(q.id) && statMap[q.statKey] >= q.target,
  ).length;

  const handleChallengeTower = () => {
    if (fighting) return;
    setFighting(true);
    playSfx('ult');

    window.setTimeout(() => {
      const allies = buildAllyUnits(lineup, ownedHeroes, relics);
      const sim = simulateFullBattle(allies, floorDef.enemies);
      setFighting(false);

      if (sim.outcome === 'victory') {
        playSfx('victory');
        haptic('success');
        const reward = completeTowerVictory();
        setTowerMessage(
          `ПОБЕДА! Этаж ${floorDef.floor} зачищен за ${sim.steps.length} ходов (+${reward.gems} 💎, +${reward.stones} камней)!`,
        );
      } else {
        haptic('warning');
        setTowerMessage(
          'Страж этажа оказался сильнее! Повысьте уровень героев или призовите новых в Портале.',
        );
      }
    }, 420);
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-lg flex-col gap-2.5 overflow-y-auto px-3 py-2.5 custom-scroll">
      {/* Sub-navigation Switch */}
      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-slate-900/90 p-1 shrink-0">
        <button
          type="button"
          onClick={() => {
            playSfx('tap');
            setSubTab('tower');
          }}
          className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-black transition ${
            subTab === 'tower'
              ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow'
              : 'text-slate-400'
          }`}
        >
          <Crown className="h-4 w-4 text-amber-300" />
          Башня Вечности ({towerFloor})
        </button>

        <button
          type="button"
          onClick={() => {
            playSfx('tap');
            setSubTab('quests');
          }}
          className={`relative flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-black transition ${
            subTab === 'quests'
              ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow'
              : 'text-slate-400'
          }`}
        >
          <Award className="h-4 w-4" />
          Задания
          {readyQuestCount > 0 && (
            <span className="rounded-full bg-rose-500 px-1.5 py-0.2 text-[10px] font-black text-white">
              {readyQuestCount}
            </span>
          )}
        </button>
      </div>

      {subTab === 'tower' ? (
        <div className="flex flex-1 flex-col justify-between gap-3 rounded-3xl border border-indigo-400/30 bg-[radial-gradient(circle_at_50%_28%,_#311056_0%,_#0b1124_70%)] p-4 shadow-2xl">
          <div className="text-center">
            <span className="rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-0.5 text-[10px] font-black uppercase tracking-widest text-amber-300">
              Этаж {floorDef.floor}
            </span>
            <h2 className="mt-1.5 text-lg font-black text-white">
              {bossUnit?.name ?? 'Страж Вечности'}
            </h2>
            <p className="text-xs text-slate-300">
              Ваша мощь:{' '}
              <span className="font-black text-emerald-300">
                {formatCompactNumber(squadPower)}
              </span>{' '}
              · Мощь этажа:{' '}
              <span className="font-black text-rose-300">
                {formatCompactNumber(floorDef.recommendedPower)}
              </span>
            </p>
          </div>

          {/* Boss Pedestal */}
          <div className="relative my-1 flex flex-col items-center justify-center py-2">
            {bossUnit && (
              <motion.div
                animate={{ scale: fighting ? [1, 1.18, 0.94, 1] : 1 }}
                transition={{ duration: 0.4 }}
              >
                <HeroRig
                  visual={bossUnit.visual}
                  facing="left"
                  size={132}
                  stars={5}
                  isBoss
                  energyReady
                  animState={fighting ? 'ult' : 'idle'}
                />
              </motion.div>
            )}

            {towerMessage && (
              <div className="mt-2 rounded-xl border border-white/15 bg-slate-950/85 px-3 py-2 text-center text-xs font-bold text-amber-200">
                {towerMessage}
              </div>
            )}
          </div>

          {/* Rewards & Challenge Button */}
          <div className="space-y-3">
            <div className="flex items-center justify-around rounded-2xl border border-white/10 bg-slate-950/75 p-2.5 text-xs font-extrabold">
              <span className="flex items-center gap-1 text-fuchsia-300">
                <Gem className="h-4 w-4 text-fuchsia-400" />+{floorDef.rewardGems}
              </span>
              <span className="flex items-center gap-1 text-amber-200">
                <Coins className="h-4 w-4 text-amber-400" />+
                {formatCompactNumber(floorDef.rewardGold)}
              </span>
              <span className="flex items-center gap-1 text-purple-200">
                <Hexagon className="h-4 w-4 text-purple-400" />+{floorDef.rewardRelicStones} камней
              </span>
            </div>

            <button
              type="button"
              disabled={fighting}
              onClick={handleChallengeTower}
              className="btn-gloss flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 py-3.5 text-sm font-black text-white shadow-xl transition active:scale-95"
            >
              <Swords className="h-5 w-5" />
              {fighting ? 'Идёт битва...' : `Штурмовать ${floorDef.floor} этаж!`}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 pb-2">
          {QUEST_DEFINITIONS.map((quest) => {
            const currentVal = statMap[quest.statKey];
            const claimed = claimedQuests.includes(quest.id);
            const completed = currentVal >= quest.target;
            const pct = Math.min(100, Math.round((currentVal / quest.target) * 100));

            return (
              <div
                key={quest.id}
                className={`flex items-center justify-between gap-2.5 rounded-2xl border p-3 ${
                  claimed
                    ? 'border-white/5 bg-slate-900/45 opacity-60'
                    : completed
                      ? 'border-amber-400/50 bg-slate-900/95'
                      : 'border-white/10 bg-slate-900/85'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-extrabold text-white">{quest.title}</div>

                  <div className="mt-1 flex items-center gap-2.5 text-[10px] font-bold">
                    <span className="inline-flex items-center gap-0.5 text-fuchsia-300">
                      <Gem className="h-3 w-3 text-fuchsia-400" />+{quest.rewardGems}
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-amber-200">
                      <Coins className="h-3 w-3 text-amber-400" />+
                      {formatCompactNumber(quest.rewardGold)}
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-sky-200">
                      <ScrollText className="h-3 w-3 text-sky-400" />+{quest.rewardScrolls} свитков
                    </span>
                  </div>

                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-950">
                      <div
                        style={{ width: `${pct}%` }}
                        className="h-full bg-gradient-to-r from-emerald-400 to-amber-400"
                      />
                    </div>
                    <span className="text-[10px] font-bold text-slate-400">
                      {Math.min(currentVal, quest.target)}/{quest.target}
                    </span>
                  </div>
                </div>

                {claimed ? (
                  <span className="inline-flex items-center gap-1 rounded-xl bg-slate-800 px-3 py-2 text-[11px] font-bold text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Взято
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={!completed}
                    onClick={() => {
                      if (claimQuest(quest.id)) {
                        playSfx('coin');
                        haptic('success');
                      }
                    }}
                    className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-black transition active:scale-95 ${
                      completed
                        ? 'btn-gloss bg-gradient-to-b from-amber-400 to-amber-600 text-slate-950 shadow-lg'
                        : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    Забрать
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

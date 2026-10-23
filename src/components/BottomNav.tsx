import { motion } from 'framer-motion';
import { Award, Shield, Sparkles, Swords, Users } from 'lucide-react';
import { playSfx } from '@/audio/sfx';
import { SINGLE_SUMMON_GEMS } from '@/game/gacha';
import { getAscendShardCost, QUEST_DEFINITIONS } from '@/game/heroes';
import { haptic } from '@/platform/telegram';
import { useGameStore } from '@/state/gameStore';
import type { AppTab } from '@/state/gameStore';

interface NavItem {
  readonly id: AppTab;
  readonly label: string;
  readonly icon: typeof Swords;
}

const NAV_ITEMS: readonly NavItem[] = [
  { id: 'battle', label: 'Кампания', icon: Swords },
  { id: 'heroes', label: 'Герои', icon: Users },
  { id: 'summon', label: 'Призыв', icon: Sparkles },
  { id: 'squad', label: 'Отряд', icon: Shield },
  { id: 'quests', label: 'Башня', icon: Award },
];

export function BottomNav() {
  const activeTab = useGameStore((s) => s.activeTab);
  const setActiveTab = useGameStore((s) => s.setActiveTab);
  const ownedHeroes = useGameStore((s) => s.ownedHeroes);
  const scrolls = useGameStore((s) => s.scrolls);
  const gems = useGameStore((s) => s.gems);
  const canFreeSummon = useGameStore((s) => s.canFreeSummon);
  const totalKills = useGameStore((s) => s.totalKills);
  const maxStage = useGameStore((s) => s.maxStage);
  const totalSummons = useGameStore((s) => s.totalSummons);
  const towerFloor = useGameStore((s) => s.towerFloor);
  const claimedQuests = useGameStore((s) => s.claimedQuests);
  const relicStones = useGameStore((s) => s.relicStones);

  const hasHeroAscend = Object.values(ownedHeroes).some(
    (h) => h.stars < 10 && h.shards >= getAscendShardCost(h.stars),
  );
  const hasSummonReady = canFreeSummon() || scrolls > 0 || gems >= SINGLE_SUMMON_GEMS;

  const highestHeroLevel = Object.values(ownedHeroes).reduce((m, h) => Math.max(m, h.level), 1);
  const statMap = { totalKills, maxStage, totalSummons, highestHeroLevel, towerFloor };
  const hasQuestClaim = QUEST_DEFINITIONS.some(
    (q) => !claimedQuests.includes(q.id) && statMap[q.statKey] >= q.target,
  );
  const hasSquadUpgrade = relicStones >= 2;

  const badgeByTab: Record<AppTab, boolean> = {
    battle: false,
    heroes: hasHeroAscend,
    summon: hasSummonReady,
    squad: hasSquadUpgrade,
    quests: hasQuestClaim,
  };

  return (
    <nav
      style={{ paddingBottom: 'max(8px, var(--safe-bottom))' }}
      className="relative z-30 shrink-0 border-t border-white/10 bg-slate-950/92 px-2 pt-1.5 backdrop-blur-md"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 gap-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          const showDot = badgeByTab[item.id] && !active;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (!active) {
                  playSfx('tap');
                  haptic('light');
                  setActiveTab(item.id);
                }
              }}
              className="relative flex flex-col items-center justify-center rounded-xl py-1.5 transition active:scale-95"
            >
              {active && (
                <motion.div
                  layoutId="activeNavPill"
                  transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                  className="absolute inset-0 rounded-xl border border-amber-400/35 bg-gradient-to-b from-amber-500/20 to-indigo-500/15 shadow-inner"
                />
              )}

              <div className="relative z-10 flex items-center justify-center">
                <Icon
                  className={`h-5 w-5 transition ${
                    active ? 'text-amber-300 scale-110' : 'text-slate-400'
                  }`}
                />
                {showDot && (
                  <span className="absolute -right-1.5 -top-1 flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
                  </span>
                )}
              </div>
              <span
                className={`relative z-10 mt-0.5 text-[10px] font-bold tracking-tight ${
                  active ? 'text-amber-200' : 'text-slate-400'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

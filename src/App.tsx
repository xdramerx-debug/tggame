import { AnimatePresence, motion } from 'framer-motion';
import { Coins, Gift, Sparkles } from 'lucide-react';
import { playSfx } from '@/audio/sfx';
import { BottomNav } from '@/components/BottomNav';
import { FlyLootLayer } from '@/components/FlyLootLayer';
import { TopBar } from '@/components/TopBar';
import { formatCompactNumber } from '@/game/heroes';
import { BattleScreen } from '@/screens/BattleScreen';
import { HeroesScreen } from '@/screens/HeroesScreen';
import { QuestsTowerScreen } from '@/screens/QuestsTowerScreen';
import { SquadScreen } from '@/screens/SquadScreen';
import { SummonScreen } from '@/screens/SummonScreen';
import { useGameStore } from '@/state/gameStore';

export function App() {
  const activeTab = useGameStore((s) => s.activeTab);
  const lootBurst = useGameStore((s) => s.lootBurst);
  const offlineModalReward = useGameStore((s) => s.offlineModalReward);
  const dismissOfflineModal = useGameStore((s) => s.dismissOfflineModal);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-transparent text-white">
      <TopBar />

      <main className="relative flex-1 min-h-0 overflow-hidden">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0.78, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
          className="h-full w-full"
        >
          {activeTab === 'battle' && <BattleScreen />}
          {activeTab === 'heroes' && <HeroesScreen />}
          {activeTab === 'summon' && <SummonScreen />}
          {activeTab === 'squad' && <SquadScreen />}
          {activeTab === 'quests' && <QuestsTowerScreen />}
        </motion.div>
      </main>

      <BottomNav />

      <FlyLootLayer burst={lootBurst} />

      {/* Welcome Back Offline AFK Loot Modal */}
      <AnimatePresence>
        {offlineModalReward && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.85, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-xs rounded-3xl border border-amber-400/45 bg-slate-900 p-5 text-center shadow-2xl"
            >
              <Gift className="mx-auto h-11 w-11 text-amber-400 animate-bounce" />
              <h2 className="mt-2 text-lg font-black text-white">С возвращением!</h2>
              <p className="mt-1 text-xs text-slate-300">
                Ваш легион сражался {offlineModalReward.minutes} мин. без перерыва и собрал трофеи:
              </p>

              <div className="mt-3 flex justify-center gap-4 rounded-2xl bg-slate-950/85 p-3 text-sm font-black">
                <span className="flex items-center gap-1 text-amber-300">
                  <Coins className="h-4 w-4" />+
                  {formatCompactNumber(offlineModalReward.gold)}
                </span>
                <span className="flex items-center gap-1 text-emerald-300">
                  <Sparkles className="h-4 w-4" />+
                  {formatCompactNumber(offlineModalReward.essence)}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  playSfx('coin');
                  dismissOfflineModal();
                }}
                className="btn-gloss mt-4 w-full rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 py-3 text-xs font-black text-slate-950 shadow-lg active:scale-95"
              >
                Забрать добычу!
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

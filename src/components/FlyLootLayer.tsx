import { AnimatePresence, motion } from 'framer-motion';
import { Coins, Gem, Sparkles } from 'lucide-react';
import type { LootBurstEvent } from '@/state/gameStore';

const ORB_OFFSETS = [
  { sx: -65, sy: 40, tx: -95, delay: 0 },
  { sx: -25, sy: 55, tx: -55, delay: 0.04 },
  { sx: 15, sy: 48, tx: -10, delay: 0.08 },
  { sx: 55, sy: 38, tx: 45, delay: 0.12 },
  { sx: -45, sy: 20, tx: 85, delay: 0.15 },
  { sx: 35, sy: 18, tx: 105, delay: 0.18 },
];

export function FlyLootLayer({ burst }: { readonly burst: LootBurstEvent | null }) {
  return (
    <AnimatePresence>
      {burst && (
        <div key={burst.id} className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
          {ORB_OFFSETS.map((orb, idx) => (
            <motion.div
              key={idx}
              initial={{
                opacity: 1,
                scale: 0.6,
                x: `calc(50vw + ${orb.sx}px)`,
                y: `calc(62vh + ${orb.sy}px)`,
              }}
              animate={{
                opacity: [1, 1, 0],
                scale: [0.8, 1.25, 0.7],
                x: `calc(50vw + ${orb.tx}px)`,
                y: '24px',
              }}
              transition={{ duration: 0.72, delay: orb.delay, ease: 'easeInOut' }}
              className="fixed left-0 top-0"
            >
              <div
                className="flex h-6 w-6 items-center justify-center rounded-full shadow-lg"
                style={{
                  background:
                    burst.kind === 'gems'
                      ? 'radial-gradient(circle, #f5d0fe 0%, #a855f7 100%)'
                      : 'radial-gradient(circle, #fef08a 0%, #f59e0b 100%)',
                  boxShadow:
                    burst.kind === 'gems' ? '0 0 14px #c084fc' : '0 0 14px #fbbf24',
                }}
              >
                {burst.kind === 'gems' ? (
                  <Gem className="h-3.5 w-3.5 text-white" />
                ) : (
                  <Coins className="h-3.5 w-3.5 text-amber-950" />
                )}
              </div>
            </motion.div>
          ))}

          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.25 }}
            className="fixed left-1/2 top-14 -translate-x-1/2 rounded-full border border-amber-400/50 bg-slate-950/90 px-4 py-1.5 text-xs font-bold text-amber-200 shadow-2xl backdrop-blur-md flex items-center gap-1.5 whitespace-nowrap"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span>{burst.label}</span>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

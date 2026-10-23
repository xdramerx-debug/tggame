import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { HeroRig } from './HeroRig';
import type { HeroVisualSpec } from '@/game/types';

export interface UltCutInData {
  readonly id: number;
  readonly heroName: string;
  readonly skillName: string;
  readonly visual: HeroVisualSpec;
}

export function UltCutIn({ cutIn }: { readonly cutIn: UltCutInData | null }) {
  return (
    <AnimatePresence>
      {cutIn && (
        <motion.div
          key={cutIn.id}
          initial={{ opacity: 0, x: -70, scale: 0.92 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 60, scale: 1.04 }}
          transition={{ duration: 0.24, ease: 'easeOut' }}
          className="pointer-events-none absolute left-2 right-2 top-2 z-30 flex items-center gap-2.5 overflow-hidden rounded-xl border px-3 py-1.5 backdrop-blur-md shadow-2xl"
          style={{
            background: `linear-gradient(95deg, rgba(6,9,19,0.92) 0%, ${cutIn.visual.primary}55 65%, rgba(6,9,19,0.88) 100%)`,
            borderColor: cutIn.visual.glow,
            boxShadow: `0 0 24px ${cutIn.visual.glow}55`,
          }}
        >
          <div className="-my-3 shrink-0">
            <HeroRig visual={cutIn.visual} size={56} animState="ult" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-300">
              <Sparkles className="h-3 w-3 shrink-0" />
              <span>Ультимейт · {cutIn.heroName}</span>
            </div>
            <div className="truncate text-sm font-black tracking-wide text-white drop-shadow">
              «{cutIn.skillName}»
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

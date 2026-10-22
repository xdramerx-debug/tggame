import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { motion } from 'framer-motion';
import { useMetaStore } from '@/store/useMetaStore';
import { META_CURRENCY } from '@/game/meta/MetaState';
import { hapticImpact } from '@/telegram/haptic';
import { hideBackButton } from '@/telegram/buttons';

interface UpgradeRowProps {
  readonly id: string;
  readonly icon: string;
  readonly label: string;
  readonly description: string;
  readonly level: number;
  readonly maxLevel: number;
  readonly cost: number | null;
  readonly maxed: boolean;
  readonly affordable: boolean;
  readonly onBuy: (id: string) => void;
}

/** One altar row: level pips, price and a 56 px buy target. */
function UpgradeRow({
  id,
  icon,
  label,
  description,
  level,
  maxLevel,
  cost,
  maxed,
  affordable,
  onBuy,
}: UpgradeRowProps): ReactElement {
  const disabled = maxed || !affordable;
  return (
    <div className="hud-panel flex items-center gap-3 px-3 py-2" data-testid={`upgrade-${id}`}>
      <span className="text-xl" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="hud-outline truncate text-sm font-semibold text-[#e8e3d6]">{label}</span>
          <span className="text-[11px] text-[#9aa3ae]" data-testid={`upgrade-level-${id}`}>
            {level}/{maxLevel}
          </span>
        </div>
        <p className="truncate text-[11px] text-[#7c8794]">{description}</p>
        <div className="mt-1 flex gap-1" aria-hidden="true">
          {Array.from({ length: maxLevel }, (_, index) => (
            <span
              key={index}
              className={`h-1 w-4 rounded-full ${index < level ? 'bg-gold' : 'bg-white/12'}`}
            />
          ))}
        </div>
      </div>
      <button
        type="button"
        className={`hud-panel flex min-h-[56px] w-20 shrink-0 flex-col items-center justify-center text-sm font-semibold transition-transform duration-100 active:scale-[0.97] ${
          disabled ? 'border-white/10 text-[#5a6470]' : 'border-gold/80 text-gold'
        }`}
        disabled={disabled}
        onPointerDown={() => hapticImpact(affordable ? 'medium' : 'light')}
        onClick={() => onBuy(id)}
        data-testid={`upgrade-buy-${id}`}
      >
        <span>{maxed ? 'МАКС' : (cost ?? '—')}</span>
        {maxed ? null : <span className="text-[10px] font-normal text-[#9aa3ae]">🔥</span>}
      </button>
    </div>
  );
}

/**
 * The altar: spends embers earned by previous runs on permanent upgrades.
 *
 * Every purchase applies immediately to the live engine (`useMetaStore` forwards
 * the new bonus block), so a player who dies, buys and restarts feels the change
 * in the first fight of the next run.
 */
export function MetaScreen({ onBack }: { readonly onBack: () => void }): ReactElement {
  const embers = useMetaStore((state) => state.embers);
  const upgrades = useMetaStore((state) => state.upgrades);
  const loaded = useMetaStore((state) => state.loaded);
  const hydrate = useMetaStore((state) => state.hydrate);
  const purchase = useMetaStore((state) => state.purchase);

  useEffect(() => {
    hideBackButton();
    if (!loaded) void hydrate();
  }, [loaded, hydrate]);

  return (
    <motion.div
      className="safe-pad absolute inset-0 z-40 flex flex-col gap-3 px-[5vw] py-[3vh]"
      style={{ background: 'linear-gradient(160deg, rgba(18,12,8,0.94) 0%, rgba(28,20,14,0.97) 55%, #0b0e14 100%)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      data-testid="meta-screen"
    >
      <header className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl tracking-[0.16em] text-gold">АЛТАРЬ</h2>
          <div className="gold-divider mt-1 w-24" />
          <p className="mt-1 text-[12px] text-[#9aa3ae]">Угли остаются после смерти. Тратьте их на силу.</p>
        </div>
        <div className="hud-panel flex min-h-[48px] items-center gap-2 px-3" data-testid="meta-embers">
          <span aria-hidden="true">{META_CURRENCY.icon}</span>
          <span className="hud-outline text-lg font-semibold text-gold">{embers}</span>
          <span className="text-[10px] uppercase tracking-widest text-[#9aa3ae]">{META_CURRENCY.name}</span>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-none">
        <div className="flex flex-col gap-2 pb-2">
          {upgrades.map((upgrade) => (
            <UpgradeRow key={upgrade.id} {...upgrade} onBuy={purchase} />
          ))}
          {!loaded ? <p className="px-1 text-sm text-[#7c8794]">Загрузка…</p> : null}
        </div>
      </div>

      <button
        type="button"
        className="hud-panel flex min-h-[56px] w-full items-center justify-center text-base font-semibold text-[#e8e3d6] active:scale-[0.97]"
        onPointerDown={() => hapticImpact('light')}
        onClick={onBack}
        data-testid="meta-back"
      >
        Назад
      </button>
    </motion.div>
  );
}

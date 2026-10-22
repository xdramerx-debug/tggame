import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { hapticSelection } from '@/telegram/haptic';

interface SheetProps {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/**
 * Bottom sheet used by settings and credits.
 * Mounted only while open (no hidden listeners), animated with a 220 ms spring.
 */
export function Sheet({ open, title, onClose, children }: SheetProps): ReactElement {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="absolute inset-0 z-30 flex items-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
        >
          <button
            type="button"
            aria-label="Закрыть"
            className="absolute inset-0 bg-black/60"
            onPointerDown={() => {
              hapticSelection();
              onClose();
            }}
          />
          <motion.section
            className="hud-panel relative flex max-h-[86dvh] w-full flex-col rounded-b-none border-b-0 px-5 pb-[calc(var(--safe-bottom)+16px)] pt-4"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 38, mass: 0.9 }}
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-white/25" />
            <div className="mb-4 flex items-center justify-between">
              <h2 className="hud-outline text-lg font-semibold text-gold">{title}</h2>
              <button
                type="button"
                className="hud-panel flex h-12 w-12 items-center justify-center text-xl text-[#e8e3d6] active:scale-95"
                onPointerDown={() => hapticSelection()}
                onClick={onClose}
                aria-label="Закрыть"
                data-testid="sheet-close"
              >
                ✕
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1" data-scrollable="true">
              {children}
            </div>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

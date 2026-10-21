import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { watchOrientation } from '@/mobile/orientation';

/**
 * Portrait fallback.
 *
 * Telegram `lockOrientation` is best-effort (iOS ignores it, desktop clients do
 * not rotate), so the app must still present something usable: a full-screen
 * blocker with a rotating-phone illustration and the portrait→landscape hint.
 */
export function OrientationOverlay(): ReactElement | null {
  const [portrait, setPortrait] = useState(() => window.innerHeight > window.innerWidth);

  useEffect(() => {
    return watchOrientation(({ kind }) => {
      setPortrait(kind === 'portrait');
    });
  }, []);

  if (!portrait) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 px-6 text-center"
      style={{ background: 'radial-gradient(circle at 50% 40%, #1e2a3a 0%, #0b0e14 75%)' }}
      role="alertdialog"
      aria-label="Поверните телефон"
      data-testid="orientation-overlay"
    >
      <svg
        width="86"
        height="86"
        viewBox="0 0 96 96"
        aria-hidden="true"
        className="animate-[rotate-hint_2.4s_ease-in-out_infinite]"
        style={{ transformOrigin: '50% 50%' }}
      >
        <style>{`@keyframes rotate-hint {0%,18%{transform:rotate(0deg)} 55%,85%{transform:rotate(-90deg)} 100%{transform:rotate(0deg)}}`}</style>
        <rect x="30" y="14" width="36" height="68" rx="7" fill="none" stroke="#C9A227" strokeWidth="3" />
        <rect x="41" y="20" width="14" height="3" rx="1.5" fill="#C9A227" opacity="0.7" />
        <circle cx="48" cy="75" r="3" fill="#C9A227" opacity="0.7" />
      </svg>
      <div>
        <p className="hud-outline text-lg font-semibold text-gold">Поверните телефон</p>
        <p className="mt-2 text-sm text-[#9aa3ae]">Игра работает только в горизонтальном режиме</p>
      </div>
    </div>
  );
}

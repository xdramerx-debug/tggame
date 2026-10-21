import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { useGameStore } from '@/store/useGameStore';
import { useUiStore } from '@/store/useGameStore';
import { hapticImpact } from '@/telegram/haptic';
import { hideBackButton } from '@/telegram/buttons';
import { enterDomFullscreen } from '@/mobile/fullscreen';
import { lockLandscape } from '@/mobile/orientation';
import { gameHost } from '@/game/GameHost';

interface MenuButtonProps {
  readonly label: string;
  readonly hint?: string;
  readonly onClick: () => void;
  readonly variant?: 'primary' | 'ghost';
}

/** Touch-first menu button: 56 px tall, spring press feedback, haptic tick. */
function MenuButton({ label, hint, onClick, variant = 'ghost' }: MenuButtonProps): ReactElement {
  const primary = variant === 'primary';
  return (
    <button
      type="button"
      className={`hud-panel flex min-h-[56px] w-full items-center justify-between px-5 py-3 transition-transform duration-100 active:scale-[0.97] ${
        primary ? 'border-gold/80' : 'border-white/10'
      }`}
      style={primary ? { background: 'linear-gradient(180deg, rgba(201,162,39,0.22), rgba(0,0,0,0.65))' } : undefined}
      onPointerDown={() => hapticImpact('light')}
      onClick={onClick}
      data-testid={`menu-${label}`}
    >
      <span className={`hud-outline text-base font-semibold ${primary ? 'text-gold' : 'text-[#e8e3d6]'}`}>{label}</span>
      {hint ? <span className="text-xs text-[#9aa3ae]">{hint}</span> : null}
    </button>
  );
}

/** Main menu. The TG BackButton is hidden here by design. */
export function MainMenu(): ReactElement {
  const setScreen = useGameStore((state) => state.setScreen);
  const openSheet = useUiStore((state) => state.openSheet);

  useEffect(() => {
    hideBackButton();
  }, []);

  const startRun = (): void => {
    hapticImpact('medium');
    // Fullscreen + orientation lock must be requested from a user gesture.
    void enterDomFullscreen().then(() => lockLandscape());
    setScreen('game');
    window.setTimeout(() => gameHost.start(), 60);
  };

  return (
    <div
      className="safe-pad fade-enter absolute inset-0 flex flex-col justify-between px-[6vw] py-[4vh]"
      style={{ background: 'linear-gradient(160deg, rgba(11,14,20,0.92) 0%, rgba(30,42,58,0.96) 55%, #0b0e14 100%)' }}
      data-testid="main-menu"
    >
      <header className="flex flex-col items-start">
        <h1 className="font-display text-4xl leading-none tracking-[0.18em] text-gold sm:text-5xl">TENEBRIS</h1>
        <div className="gold-divider mt-2 w-32" />
        <p className="mt-2 max-w-[46ch] text-sm text-[#9aa3ae]">
          Рогалик-выживание в подземелье. Только телефон, только прикосновения.
        </p>
      </header>

      <div className="mx-auto flex w-full max-w-md flex-col gap-3">
        <MenuButton label="Начать забег" hint="Этап 1 · арена" variant="primary" onClick={startRun} />
        <MenuButton label="Настройки" hint="качество · управление" onClick={() => openSheet('settings')} />
        <MenuButton label="Титры" hint="ассеты и лицензии" onClick={() => openSheet('credits')} />
      </div>

      <footer className="flex items-center justify-between text-[11px] uppercase tracking-[0.25em] text-[#5a6470]">
        <span>v0.2.0 · stage 2</span>
        <span>landscape only</span>
      </footer>
    </div>
  );
}

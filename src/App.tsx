import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { useGame } from '@/state/store';
import { sfx } from '@/audio/sfx';
import { initTelegram, lockLandscape } from '@/platform/telegram';
import { keepScreenAwake, allowScreenSleep } from '@/platform/wakeLock';
import { MenuScreen } from '@/ui/MenuScreen';
import { SelectScreen } from '@/ui/SelectScreen';
import { FightScreen } from '@/ui/FightScreen';
import { ResultScreen } from '@/ui/ResultScreen';

function OrientationGate(): ReactElement {
  return (
    <div className="orientation-gate absolute inset-0 z-50 flex-col items-center justify-center gap-4 bg-ink px-8 text-center">
      <div className="h-16 w-28 rotate-90 rounded-md border-2 border-bone/30" />
      <div className="font-display text-[22px] uppercase tracking-[0.12em] text-bone">поверни телефон</div>
      <div className="max-w-[30ch] text-[13px] leading-snug text-bone/45">
        Яма открывается только в горизонтали: двум большим пальцам нужно место.
      </div>
    </div>
  );
}

export function App(): ReactElement {
  const screen = useGame((state) => state.screen);
  const sound = useGame((state) => state.sound);

  useEffect(() => {
    initTelegram();
    keepScreenAwake();
    void lockLandscape();

    const unlockAudio = (): void => {
      sfx.unlock();
      if (useGame.getState().sound) sfx.startAmbience();
    };
    const blockContext = (event: Event): void => { event.preventDefault(); };
    const blockGesture = (event: Event): void => { event.preventDefault(); };
    const handleVisibility = (): void => {
      if (document.visibilityState === 'hidden') {
        sfx.suspend();
      } else if (useGame.getState().sound) {
        sfx.resume();
      }
    };
    const handleResize = (): void => {
      // 100dvh is handled by CSS; this forces a layout flush after rotation so
      // the canvas never keeps the pre-rotation size.
      document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
    };

    document.addEventListener('contextmenu', blockContext);
    document.addEventListener('gesturestart', blockGesture);
    window.addEventListener('pointerdown', unlockAudio, { passive: true });
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      document.removeEventListener('contextmenu', blockContext);
      document.removeEventListener('gesturestart', blockGesture);
      window.removeEventListener('pointerdown', unlockAudio);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('resize', handleResize);
      allowScreenSleep();
      sfx.stopAmbience();
      sfx.suspend();
    };
  }, []);

  useEffect(() => {
    sfx.setEnabled(sound);
    if (sound) sfx.unlock();
  }, [sound]);

  return (
    <div className="app-shell relative h-[100dvh] w-full overflow-hidden bg-ink text-bone">
      <div key={screen} className="screen-enter absolute inset-0">
        {screen === 'menu' && <MenuScreen />}
        {screen === 'select' && <SelectScreen />}
        {screen === 'fight' && <FightScreen />}
        {screen === 'result' && <ResultScreen />}
      </div>
      <OrientationGate />
    </div>
  );
}

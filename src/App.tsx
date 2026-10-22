import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { GameCanvas } from './ui/components/GameCanvas';
import { SplashScreen } from './ui/SplashScreen';
import { MainMenu } from './ui/MainMenu';
import { GameScreen } from './ui/GameScreen';
import { MetaScreen } from './ui/MetaScreen';
import { SettingsSheet } from './ui/SettingsSheet';
import { CreditsSheet } from './ui/CreditsSheet';
import { OrientationOverlay } from './ui/OrientationOverlay';
import { useGameStore, useUiStore } from './store/useGameStore';
import { useSettingsStore } from './store/useSettingsStore';
import { useMetaStore } from '@/store/useMetaStore';
import { gameHost } from './game/GameHost';
import { installGestureGuards } from './mobile/gestures';
import { installLifecycle } from './mobile/lifecycle';
import { lockLandscape, isLandscape } from './mobile/orientation';
import { watchSafeArea } from './telegram/viewport';
import { watchTheme } from './telegram/theme';
import { configureHaptics } from './telegram/haptic';

/** Minimum splash time — prevents a flash of the menu on fast devices. */
const MIN_SPLASH_MS = 900;

function FatalBootScreen({ message }: { readonly message: string }): ReactElement {
  return (
    <div className="safe-pad absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-void px-6 text-center">
      <h1 className="text-lg font-semibold text-blood">3D не запустился</h1>
      <p className="max-w-[46ch] text-sm text-[#9aa3ae]">{message}</p>
      <p className="text-xs text-[#5a6470]">Проверьте, что WebGL включён в настройках браузера.</p>
    </div>
  );
}

/**
 * Root component.
 *
 * Boot order matters:
 * 1. settings hydrate from IndexedDB (synchronous UI reads after this),
 * 2. theme / safe-area / gestures / lifecycle wiring,
 * 3. engine boot on the singleton canvas (progress on splash),
 * 4. splash → menu transition after `MIN_SPLASH_MS`.
 */
export function App(): ReactElement {
  const screen = useGameStore((state) => state.screen);
  const setScreen = useGameStore((state) => state.setScreen);
  const booted = useGameStore((state) => state.booted);
  const bootError = useGameStore((state) => state.bootError);
  const progress = useGameStore((state) => state.progress);
  const sheet = useUiStore((state) => state.sheet);
  const closeSheet = useUiStore((state) => state.closeSheet);

  // Device wiring that must exist before the first frame.
  useEffect(() => {
    const cleanups: (() => void)[] = [];
    cleanups.push(installGestureGuards());
    cleanups.push(
      watchSafeArea(),
      watchTheme(() => undefined),
    );
    cleanups.push(
      installLifecycle({
        onPause: () => {
          gameHost.pause();
        },
        onResume: () => {
          if (useGameStore.getState().screen === 'game') gameHost.resume();
          if (!isLandscape()) void lockLandscape();
        },
      }),
    );

    void (async () => {
      await useSettingsStore.getState().hydrate();
      // Meta bonuses must be known before the engine builds the dungeon scene.
      await useMetaStore.getState().hydrate();
      const settings = useSettingsStore.getState();
      configureHaptics({ enabled: settings.hapticsEnabled, intensity: settings.hapticIntensity });
      const engine = gameHost.getEngine();
      engine?.rig.setZoom(5);
      if (engine) engine.rig.degreesPerPx = settings.cameraSensitivity;
      if (settings.quality !== 'auto') gameHost.setQuality(settings.quality);
    })();

    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, []);

  // Splash → menu, once the engine reports ready and the minimum dwell elapsed.
  useEffect(() => {
    if (screen !== 'splash' || !booted || progress.stage !== 'ready' || bootError) return;
    const timer = window.setTimeout(() => {
      setScreen('menu');
      void lockLandscape();
    }, MIN_SPLASH_MS);
    return () => window.clearTimeout(timer);
  }, [screen, booted, progress.stage, bootError, setScreen]);

  // Keep camera sensitivity in sync with the settings store.
  const sensitivity = useSettingsStore((state) => state.cameraSensitivity);
  const invertY = useSettingsStore((state) => state.invertCameraY);
  useEffect(() => {
    const engine = gameHost.getEngine();
    if (!engine) return;
    engine.rig.degreesPerPx = sensitivity;
    engine.rig.invertY = invertY;
  }, [sensitivity, invertY, booted]);

  // Leaving the run always stops the render loop (battery + input isolation).
  useEffect(() => {
    if (screen !== 'game') gameHost.pause();
  }, [screen]);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-void" data-screen={screen}>
      <GameCanvas />

      <AnimatePresence mode="wait" initial={false}>
        {screen === 'splash' && !bootError ? (
          <motion.div
            key="splash"
            className="absolute inset-0"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <SplashScreen />
          </motion.div>
        ) : null}

        {screen === 'menu' ? (
          <motion.div
            key="menu"
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <MainMenu />
          </motion.div>
        ) : null}

        {screen === 'game' ? (
          <motion.div
            key="game"
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <GameScreen />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/*
        The altar is an *overlay*, not a page in the main `AnimatePresence`:
        `mode="wait"` has to finish the game screen's exit animation before it
        mounts the next child, and a screen that is unmounted mid-transition can
        leave a dead copy in the DOM — one that still reacts to the economy but
        never repaints. A dedicated presence keeps exactly one altar tree alive.
      */}
      <AnimatePresence initial={false}>
        {screen === 'meta' ? (
          <motion.div
            key="meta"
            className="absolute inset-0 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <MetaScreen onBack={() => setScreen('menu')} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {bootError ? <FatalBootScreen message={bootError} /> : null}

      <SettingsSheet open={sheet === 'settings'} onClose={closeSheet} />
      <CreditsSheet open={sheet === 'credits'} onClose={closeSheet} />

      <OrientationOverlay />
    </div>
  );
}

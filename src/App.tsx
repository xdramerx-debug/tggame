import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { BottomNav } from './components/BottomNav';
import { ModalHost } from './components/ModalHost';
import { ToastLayer } from './components/ToastLayer';
import { TopBar } from './components/TopBar';
import { BattleScreen } from './screens/BattleScreen';
import { BootScreen } from './screens/BootScreen';
import { DiaryScreen } from './screens/DiaryScreen';
import { EchoScreen } from './screens/EchoScreen';
import { ForgeScreen } from './screens/ForgeScreen';
import { HeroesScreen } from './screens/HeroesScreen';
import { HomeScreen } from './screens/HomeScreen';
import { LabyrinthScreen } from './screens/LabyrinthScreen';
import { LeaderboardScreen } from './screens/LeaderboardScreen';
import { MoreScreen } from './screens/MoreScreen';
import { QuestsScreen } from './screens/QuestsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ShopScreen } from './screens/ShopScreen';
import { SquadScreen } from './screens/SquadScreen';
import { SummonScreen } from './screens/SummonScreen';
import { TowerScreen } from './screens/TowerScreen';
import { useGameStore } from './state/gameStore';
import { playBgm, suspendAudio, resumeAudio } from './platform/audio';
import { markOpen, sessionDurationMs, track } from './platform/analytics';
import { dayKey } from './game/quests';

export function App(): ReactElement {
  const booted = useGameStore((s) => s.booted);
  const boot = useGameStore((s) => s.boot);
  const screen = useGameStore((s) => s.screen);
  const theme = useGameStore((s) => s.game.settings.theme);
  const muted = useGameStore((s) => s.game.settings.muted);
  const hitboxes = useGameStore((s) => s.game.devFlags.hitboxes);
  const showFps = useGameStore((s) => s.game.devFlags.fps);
  const [bootDone, setBootDone] = useState(false);

  // theme (§7, §13): dark/light, follows the setting (defaults from Telegram theme)
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // BGM: calm hub vs tense battle (§8)
  useEffect(() => {
    if (!booted || muted) return;
    playBgm(screen === 'battle' ? 'battle' : 'hub');
  }, [screen, booted, muted]);

  // Pause on WebView hide / Telegram minimize; autosave on exit (§2, §8)
  useEffect(() => {
    const onHide = (): void => {
      if (document.hidden) {
        suspendAudio();
        useGameStore.getState().save();
        track('session_pause', { seconds: Math.round(sessionDurationMs() / 1000), exitScreen: useGameStore.getState().screen });
      } else {
        resumeAudio();
      }
    };
    const onUnload = (): void => { useGameStore.getState().save(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onUnload);
    };
  }, []);

  const onBootDone = (): void => {
    boot();
    setBootDone(true);
    markOpen();
    // returning player: daily calendar if today is unclaimed (§1)
    const st = useGameStore.getState();
    const g = st.game;
    if (g.ftue.done && g.daily.lastClaimDate !== dayKey() && st.modal === null) {
      useGameStore.setState({ modal: 'dailyLogin' });
    }
  };

  if (!bootDone) {
    return <BootScreen onDone={onBootDone} />;
  }

  return (
    <div className="app-shell" data-hitboxes={hitboxes ? '1' : '0'}>
      {showFps ? <FpsCounter /> : null}
      {screen !== 'battle' ? <TopBar /> : null}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {renderScreen(screen)}
      </main>
      {screen !== 'battle' ? <BottomNav /> : null}
      <ModalHost />
      <ToastLayer />
      <FtueHint />
    </div>
  );
}

function renderScreen(screen: string): ReactElement {
  switch (screen) {
    case 'home': return <HomeScreen />;
    case 'battle': return <BattleScreen />;
    case 'heroes': return <HeroesScreen />;
    case 'squad': return <SquadScreen />;
    case 'summon': return <SummonScreen />;
    case 'more': return <MoreScreen />;
    case 'tower': return <TowerScreen />;
    case 'labyrinth': return <LabyrinthScreen />;
    case 'forge': return <ForgeScreen />;
    case 'echo': return <EchoScreen />;
    case 'diary': return <DiaryScreen />;
    case 'quests': return <QuestsScreen />;
    case 'leaderboard': return <LeaderboardScreen />;
    case 'shop': return <ShopScreen />;
    case 'settings': return <SettingsScreen />;
    default: return <HomeScreen />;
  }
}

/** Контекстные одноразовые подсказки FTUE (§1): плашка внизу, не блокирует игру. */
function FtueHint(): ReactElement | null {
  const ftue = useGameStore((s) => s.game.ftue);
  const screen = useGameStore((s) => s.screen);
  if (ftue.done || screen === 'battle') return null;
  let text: string | null = null;
  if (ftue.step === 0 && screen === 'home') text = 'Это Велес, твой первый герой. Жми «В БОЙ» — сражение идёт само, ты лишь готовишь состав ✨';
  if (ftue.step === 2 && screen !== 'heroes') text = 'Шаг 3 из 4: открой «Герои» → карточку Велеса → «Улучшить» ⬆';
  if (ftue.step === 3 && screen !== 'home') text = 'Шаг 4 из 4: вернись в «Бой» и победи снова — теперь герой сильнее!';
  if (!text) return null;
  return <div className="ftue-hint">{text}</div>;
}

function FpsCounter(): ReactElement {
  const [fps, setFps] = useState(0);
  const frames = useRef(0);
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number): void => {
      frames.current += 1;
      if (now - last >= 1000) {
        setFps(frames.current);
        frames.current = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); };
  }, []);
  return <div className="fps-counter">{fps} FPS</div>;
}

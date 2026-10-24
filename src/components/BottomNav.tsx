import type { ReactElement } from 'react';
import { useGameStore, type ScreenId } from '../state/gameStore';

const TABS: { id: ScreenId; icon: string; label: string }[] = [
  { id: 'heroes', icon: '🦸', label: 'Герои' },
  { id: 'squad', icon: '⚔️', label: 'Отряд' },
  { id: 'home', icon: '🏰', label: 'Бой' },
  { id: 'summon', icon: '🌠', label: 'Призыв' },
  { id: 'more', icon: '🧭', label: 'Ещё' },
];

const MORE_SCREENS: ScreenId[] = ['more', 'tower', 'labyrinth', 'forge', 'echo', 'diary', 'quests', 'leaderboard', 'shop', 'settings'];

export function BottomNav(): ReactElement {
  const screen = useGameStore((s) => s.screen);
  const setScreen = useGameStore((s) => s.setScreen);
  const offlineReady = useGameStore((s) => s.offlineReward !== null);

  const showDot = offlineReady;

  return (
    <nav className="bottom-nav">
      {TABS.map((t) => (
        <button key={t.id} className={`nav-btn ${screen === t.id || (t.id === 'more' && MORE_SCREENS.includes(screen)) ? 'active' : ''}`} onClick={() => { setScreen(t.id); }}>
          <span className="nav-icon">{t.icon}</span>
          {t.label}
          {t.id === 'more' && showDot ? <span className="nav-dot" /> : null}
        </button>
      ))}
    </nav>
  );
}

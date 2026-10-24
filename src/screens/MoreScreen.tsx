import type { ReactElement } from 'react';
import { LABYRINTH_UNLOCK_STAGE } from '../game/constants';
import { useGameStore, type ScreenId } from '../state/gameStore';
import { SectionTitle } from '../components/ui';

const LINKS: { id: ScreenId; icon: string; title: string; sub: string }[] = [
  { id: 'tower', icon: '🗼', title: 'Башня Эха', sub: 'бесконечный режим, награда за первый проход' },
  { id: 'labyrinth', icon: '🪞', title: 'Лабиринт отражений', sub: `копии вашего отряда · с этапа ${LABYRINTH_UNLOCK_STAGE}` },
  { id: 'forge', icon: '⚒️', title: 'Кузница душ', sub: 'крафт экипировки из осколков душ' },
  { id: 'echo', icon: '👻', title: 'Эхо павших', sub: 'баффы за осколки душ после поражений' },
  { id: 'diary', icon: '📖', title: 'Дневник странника', sub: 'лор-коллекция с пассивными бонусами' },
  { id: 'quests', icon: '📋', title: 'Задания и Вознесение', sub: 'ежедневные, еженедельные цели, престиж' },
  { id: 'leaderboard', icon: '🏆', title: 'Доска лидеров', sub: 'сила отряда и рекорд башни' },
  { id: 'shop', icon: '🛒', title: 'Магазин', sub: 'кристаллы за Telegram Stars, реклама' },
  { id: 'settings', icon: '⚙️', title: 'Настройки', sub: 'звук, тема, промокоды, dev-инструменты' },
];

export function MoreScreen(): ReactElement {
  const setScreen = useGameStore((s) => s.setScreen);
  const game = useGameStore((s) => s.game);

  return (
    <div className="screen-scroll">
      <SectionTitle>Ещё</SectionTitle>
      <div className="col">
        {LINKS.map((l) => {
          const locked = l.id === 'labyrinth' && !game.labyrinth.unlocked;
          return (
            <button key={l.id} className="list-row" style={{ textAlign: 'left', opacity: locked ? 0.55 : 1, width: '100%' }} onClick={() => { setScreen(l.id); }}>
              <span style={{ fontSize: 26 }}>{l.icon}</span>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontWeight: 800, fontSize: 14 }}>{l.title} {locked ? '🔒' : ''}</span>
                <span className="tiny">{l.sub}</span>
              </span>
              <span className="muted">›</span>
            </button>
          );
        })}
      </div>
      <div style={{ height: 16 }} />
    </div>
  );
}

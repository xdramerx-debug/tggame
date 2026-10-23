import type { ReactElement } from 'react';
import { DIARY, DIARY_FULL_BONUS } from '../game/diary';
import { useGameStore } from '../state/gameStore';
import { SectionTitle } from '../components/ui';

/**
 * «Дневник странника» (14.5): short lore entries unlocked by progress.
 * Each entry is a small passive team bonus; the full collection grants
 * +10% to all stats and the title «Странник Эха».
 */
export function DiaryScreen(): ReactElement {
  const unlocked = useGameStore((s) => s.game.diary);
  const full = unlocked.length >= DIARY.length;

  return (
    <div className="screen-scroll">
      <SectionTitle right={<span className="res-chip">📖 {unlocked.length} / {DIARY.length}</span>}>
        Дневник странника
      </SectionTitle>

      <div className="panel panel-tight">
        <div className="tiny">Каждая запись — пассивный бонус отряду. Бонусы складываются. Записи открываются за этапы кампании, боссов, башню, лабиринт и призывы.</div>
      </div>

      {full ? (
        <div className="panel" style={{ marginTop: 10, borderColor: 'var(--gold)', textAlign: 'center' }}>
          <div className="title-md rarity-legendary">🏅 Титул: «Странник Эха»</div>
          <div className="small">{DIARY_FULL_BONUS.desc}</div>
        </div>
      ) : null}

      <div className="col" style={{ marginTop: 10 }}>
        {DIARY.map((e) => {
          const has = unlocked.includes(e.id);
          return (
            <div key={e.id} className={`panel panel-tight diary-card ${has ? '' : 'locked'}`}>
              <div className="row-between">
                <b style={{ fontSize: 13 }}>{has ? e.title : '???'}</b>
                <span className="aura-chip">{has ? e.bonusLabel : '🔒'}</span>
              </div>
              <div className="small" style={{ marginTop: 4 }}>
                {has ? e.text : `Запись ещё не открыта. (${unlockHint(e)})`}
              </div>
              {/* иллюстрация-плейсхолдер — потом арт (§14.5) */}
              <div style={{ marginTop: 6, height: 34, borderRadius: 8, background: 'linear-gradient(120deg, var(--panel2), transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, opacity: has ? 1 : 0.3 }}>
                {has ? '🖋️' : '🌫️'}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ height: 16 }} />
    </div>
  );
}

function unlockHint(e: (typeof DIARY)[number]): string {
  const u = e.unlock;
  switch (u.kind) {
    case 'stage': return `Этап кампании ${u.value}`;
    case 'tower': return `Этаж башни ${u.value}`;
    case 'labyrinth': return 'Полный проход Лабиринта отражений';
    case 'summons': return `${u.value} призывов`;
    case 'ascension': return 'Первое Вознесение';
    case 'rank': return `Ранг ${u.value} у любого героя`;
    case 'forgeLegendary': return 'Легендарный предмет из Кузницы душ';
  }
}

import type { ReactElement } from 'react';
import { questDef } from '../game/quests';
import { fmt, useGameStore } from '../state/gameStore';
import { SectionTitle } from '../components/ui';

/** Ежедневные и еженедельные задания (§6). */
export function QuestsScreen(): ReactElement {
  const game = useGameStore((s) => s.game);
  const claim = useGameStore((s) => s.claimQuest);

  return (
    <div className="screen-scroll">
      <SectionTitle right={<span className="res-chip">📅 {game.quests.dailyDate}</span>}>Ежедневные задания</SectionTitle>
      <div className="col">
        {game.quests.daily.map((q) => {
          const def = questDef(q.id);
          if (!def) return null;
          const done = q.progress >= q.target;
          return (
            <div key={q.id} className="list-row">
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{def.title}</div>
                <div className="row" style={{ marginTop: 4 }}>
                  <div className="progress-line"><div className="progress-fill" style={{ width: `${(q.progress / q.target) * 100}%` }} /></div>
                  <span className="tiny">{q.progress}/{q.target}</span>
                </div>
                <div className="tiny">Награда: {def.rewardLabel}</div>
              </div>
              <button className={`btn btn-sm ${done && !q.claimed ? 'btn-gold' : ''}`} disabled={!done || q.claimed} onClick={() => { claim('daily', q.id); }}>
                {q.claimed ? '✅' : done ? 'Забрать' : '…'}
              </button>
            </div>
          );
        })}
      </div>

      <SectionTitle>Еженедельная цель</SectionTitle>
      <div className="col">
        {game.quests.weekly.map((q) => {
          const def = questDef(q.id);
          if (!def) return null;
          const done = q.progress >= q.target;
          return (
            <div key={q.id} className="list-row">
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{def.title}</div>
                <div className="row" style={{ marginTop: 4 }}>
                  <div className="progress-line"><div className="progress-fill" style={{ width: `${(q.progress / q.target) * 100}%` }} /></div>
                  <span className="tiny">{q.progress}/{q.target}</span>
                </div>
                <div className="tiny">Награда: {def.rewardLabel} · неделя {game.quests.weeklyKey}</div>
              </div>
              <button className={`btn btn-sm ${done && !q.claimed ? 'btn-gold' : ''}`} disabled={!done || q.claimed} onClick={() => { claim('weekly', q.id); }}>
                {q.claimed ? '✅' : done ? 'Забрать' : '…'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Prestige (§6) — не раньше 3–5 дней игры, поэтому за 40-м этапом */}
      <SectionTitle>Вознесение (Prestige)</SectionTitle>
      <div className="panel">
        <div className="row-between">
          <div style={{ flex: 1 }}>
            <div className="small">Сброс кампании и башни в обмен на ПОСТОЯННЫЙ множитель золота и опыта.</div>
            <div className="tiny" style={{ marginTop: 4 }}>
              Вознесений: {game.prestige.ascensions} · текущий множитель: <b>x{game.prestige.multiplier.toFixed(2)}</b> · пройдено этапов: {game.campaign.maxStage}
            </div>
          </div>
        </div>
        <button className={`btn btn-wide ${game.campaign.maxStage >= 40 ? 'btn-cta' : ''}`} style={{ marginTop: 8 }} disabled={game.campaign.maxStage < 40} onClick={() => { useGameStore.setState({ modal: 'ascension' }); }}>
          {game.campaign.maxStage >= 40 ? '🌠 Вознестись' : `🔒 Нужно пройти этап 40 (сейчас ${game.campaign.maxStage})`}
        </button>
        <div className="tiny" style={{ marginTop: 4 }}>Герои, звёзды, экипировка и дневник сохраняются навсегда.</div>
      </div>

      <div className="panel panel-tight" style={{ marginTop: 12 }}>
        <div className="tiny">Статистика: побед {game.stats.battlesWon} · поражений {game.stats.battlesLost} · призывов {game.stats.summons} · ковкок {game.stats.forges} · золота всего {fmt(game.resources.gold)}</div>
      </div>
      <div style={{ height: 16 }} />
    </div>
  );
}

import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { DAILY_LOGIN_REWARDS } from '../game/constants';
import { formatDuration } from '../game/offline';
import { dayKey } from '../game/quests';
import { recentEvents } from '../platform/analytics';
import { fmt, useGameStore } from '../state/gameStore';
import { Modal } from './ui';

/** Global modals driven by store.modal: offline, daily login, defeat report, ad player, code results. */
export function ModalHost(): ReactElement | null {
  const modal = useGameStore((s) => s.modal);
  switch (modal) {
    case 'offline': return <OfflineModal />;
    case 'dailyLogin': return <DailyLoginModal />;
    case 'defeatReport': return <DefeatModal />;
    case 'adPlayer': return <AdPlayerModal />;
    case 'codeResult': return <CodeResultModal />;
    case 'adminLog': return <AdminLogModal />;
    case 'ascension': return <AscensionModal />;
    default: return null;
  }
}

function OfflineModal(): ReactElement {
  const off = useGameStore((s) => s.offlineReward);
  const collect = useGameStore((s) => s.collectOffline);
  const watchAd = useGameStore((s) => s.watchAd);
  const game = useGameStore((s) => s.game);
  if (!off) return <></>;
  return (
    <Modal title="⏳ Пока вас не было">
      <div className="col" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40 }}>🌙</div>
        <div className="small">Отряд сражался {formatDuration(off.seconds * 1000)}{off.capped ? ' (кап 12 часов — возвращайтесь чаще!)' : ''}</div>
        <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap', margin: '8px 0' }}>
          <span className="res-chip">🪙 +{fmt(off.gold)}</span>
          <span className="res-chip">📘 +{fmt(off.exp)}</span>
          {off.shards > 0 ? <span className="res-chip">🔷 +{off.shards}</span> : null}
          {off.souls > 0 ? <span className="res-chip">👻 +{off.souls}</span> : null}
        </div>
        <button className="btn btn-cta btn-wide" onClick={() => { collect(1); }}>Забрать</button>
        {game.adsToday.count < 5 ? (
          <button className="btn btn-wide" onClick={() => { watchAd('offlineX2'); }}>📺 Удвоить за рекламу (x2)</button>
        ) : null}
      </div>
    </Modal>
  );
}

function DailyLoginModal(): ReactElement {
  const game = useGameStore((s) => s.game);
  const claim = useGameStore((s) => s.claimDailyLogin);
  const close = (): void => { useGameStore.setState({ modal: null }); };
  const claimedToday = game.daily.lastClaimDate === dayKey();
  const todayIdx = game.daily.streak % 7;

  return (
    <Modal title="📅 Ежедневный вход" onClose={claimedToday ? close : undefined}>
      <div className="calendar-grid">
        {DAILY_LOGIN_REWARDS.map((r, i) => (
          <div key={r.day} className={`cal-day ${i < todayIdx || claimedToday ? 'claimed' : ''} ${i === todayIdx && !claimedToday ? 'today' : ''}`}>
            <span>Д{r.day}</span>
            <span style={{ fontSize: 14 }}>{['🪙', '📜', '💎', '🔷', '👻', '🎁', '👑'][i]}</span>
            {i < todayIdx || (claimedToday && i === todayIdx) ? <span>✅</span> : null}
          </div>
        ))}
      </div>
      <div className="small" style={{ textAlign: 'center', marginTop: 8 }}>
        Сегодня (день {todayIdx + 1}): <b>{DAILY_LOGIN_REWARDS[todayIdx]?.label}</b>
      </div>
      {claimedToday ? (
        <button className="btn btn-wide" style={{ marginTop: 10 }} onClick={close}>Отлично!</button>
      ) : (
        <button className="btn btn-cta btn-wide" style={{ marginTop: 10 }} onClick={claim}>Забрать награду дня</button>
      )}
      <div className="tiny" style={{ textAlign: 'center', marginTop: 6 }}>Награды нарастают 7 дней, затем цикл повторяется</div>
    </Modal>
  );
}

function DefeatModal(): ReactElement {
  const tips = useGameStore((s) => s.defeatTips);
  const battle = useGameStore((s) => s.battle);
  const setScreen = useGameStore((s) => s.setScreen);
  const startBattle = useGameStore((s) => s.startBattle);
  const game = useGameStore((s) => s.game);
  const close = (): void => { useGameStore.setState({ modal: null, battle: null, screen: 'home' }); };

  return (
    <Modal title="💀 Поражение — это не конец">
      <div className="col" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40 }}>👻</div>
        <div className="small">
          Павшие герои оставили эхо — осколки душ уже в запасе (<b className="rarity-epic">{game.resources.souls} 👻</b>).
          Поражение не бывает пустым — потратьте их на бафф или ковку.
        </div>
        <div className="panel panel-tight" style={{ textAlign: 'left', marginTop: 8 }}>
          <div className="tiny">РАЗБОР БОЯ:</div>
          {tips.map((t, i) => <div key={i} className="small">• {t}</div>)}
        </div>
        <div className="row" style={{ gap: 8, marginTop: 6 }}>
          <button className="btn" style={{ flex: 1 }} onClick={() => { close(); setScreen('squad'); }}>⚔️ Сменить состав</button>
          <button className="btn" style={{ flex: 1 }} onClick={() => { close(); setScreen('echo'); }}>👻 Бафф эха</button>
        </div>
        <button className="btn btn-cta btn-wide" style={{ marginTop: 8 }} onClick={() => { useGameStore.setState({ modal: null, battle: null }); if (battle) startBattle(battle.mode); }}>
          🔁 Реванш
        </button>
      </div>
    </Modal>
  );
}

function AdPlayerModal(): ReactElement {
  const completeAd = useGameStore((s) => s.completeAd);
  const [left, setLeft] = useState(5);

  useEffect(() => {
    const t = window.setInterval(() => {
      setLeft((v) => {
        if (v <= 1) {
          window.clearInterval(t);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => { window.clearInterval(t); };
  }, []);

  return (
    <Modal>
      <div className="col" style={{ textAlign: 'center', padding: '16px 0' }}>
        <div className="tiny">РЕКЛАМА · награда выдаётся только после полного просмотра</div>
        <div style={{ fontSize: 52, margin: '14px 0' }}>📺</div>
        {left > 0 ? (
          <>
            <div className="ad-count">{left}</div>
            <div className="small muted">«Реклама» идёт… закрытие недоступно</div>
          </>
        ) : (
          <>
            <div className="title-md" style={{ color: 'var(--ok)' }}>Просмотр завершён!</div>
            <button className="btn btn-cta btn-wide" style={{ marginTop: 10 }} onClick={completeAd}>Забрать награду</button>
          </>
        )}
      </div>
    </Modal>
  );
}

function CodeResultModal(): ReactElement {
  const res = useGameStore((s) => s.lastCodeResult);
  const close = (): void => { useGameStore.setState({ modal: null }); };
  return (
    <Modal onClose={close}>
      <div className="col" style={{ textAlign: 'center', padding: '8px 0' }}>
        <div style={{ fontSize: 40 }}>{res?.ok ? '✅' : '⛔'}</div>
        <div className="title-md">{res?.ok ? 'Код применён' : 'Код недействителен'}</div>
        {res?.ok && res.label !== 'Код применён' ? <div className="small" style={{ color: 'var(--gold)' }}>{res.label}</div> : null}
        <button className="btn btn-wide" style={{ marginTop: 10 }} onClick={close}>Ок</button>
      </div>
    </Modal>
  );
}

function AdminLogModal(): ReactElement {
  const close = (): void => { useGameStore.setState({ modal: null }); };
  const events = recentEvents(20).slice().reverse();
  return (
    <Modal title="admin_log — последние 20 действий" onClose={close} wide>
      <div className="col" style={{ maxHeight: 320, overflowY: 'auto' }}>
        {events.map((e, i) => (
          <div key={i} className="tiny" style={{ fontFamily: 'monospace' }}>
            {new Date(e.at).toLocaleTimeString('ru-RU')} · {e.name}{e.props ? ` ${JSON.stringify(e.props)}` : ''}
          </div>
        ))}
      </div>
      <button className="btn btn-wide" style={{ marginTop: 10 }} onClick={close}>Закрыть</button>
    </Modal>
  );
}

function AscensionModal(): ReactElement {
  const game = useGameStore((s) => s.game);
  const ascend = useGameStore((s) => s.ascend);
  const close = (): void => { useGameStore.setState({ modal: null }); };
  const bonus = 0.25 + game.campaign.maxStage * 0.005;
  return (
    <Modal title="🌠 Вознесение" onClose={close}>
      <div className="col" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40 }}>🌠</div>
        <div className="small">
          Сбросить кампанию и башню, чтобы получить ПОСТОЯННЫЙ множитель золота и опыта.
        </div>
        <div className="panel panel-tight" style={{ textAlign: 'left' }}>
          <div className="tiny">Текущий множитель: x{game.prestige.multiplier.toFixed(2)}</div>
          <div className="tiny">После вознесения: <b style={{ color: 'var(--gold)' }}>x{(game.prestige.multiplier + bonus).toFixed(2)}</b></div>
          <div className="tiny">Сохраняются: герои, звёзды, экипировка, дневник, кристаллы</div>
          <div className="tiny">Сбрасываются: этап кампании, этаж башни, золото и опыт</div>
        </div>
        <div className="row" style={{ gap: 8, marginTop: 6 }}>
          <button className="btn" style={{ flex: 1 }} onClick={close}>Позже</button>
          <button className="btn btn-cta" style={{ flex: 1 }} onClick={ascend}>Вознестись</button>
        </div>
      </div>
    </Modal>
  );
}

import { useState } from 'react';
import type { ReactElement } from 'react';
import { ADS_PER_DAY } from '../game/constants';
import { AD_REWARDS, SHOP_PACKS, validatePurchaseServerSide, type ShopPack } from '../game/monetization';
import { useGameStore } from '../state/gameStore';
import { Modal, SectionTitle } from '../components/ui';
import { track } from '../platform/analytics';

/**
 * Shop (§10): Telegram Stars packs with visible prices, one-time starter pack,
 * rewarded ads (≤5/day, player-initiated). No interstitials, no subscriptions.
 * The prototype emulates: Stars invoice → server validates successful_payment.
 */
export function ShopScreen(): ReactElement {
  const game = useGameStore((s) => s.game);
  const buyPack = useGameStore((s) => s.buyPack);
  const watchAd = useGameStore((s) => s.watchAd);
  const toast = useGameStore((s) => s.toast);
  const [confirmPack, setConfirmPack] = useState<ShopPack | null>(null);
  const [paying, setPaying] = useState(false);

  const pay = async (): Promise<void> => {
    if (!confirmPack) return;
    setPaying(true);
    track('purchase_start', { pack: confirmPack.id });
    // В Telegram здесь открывается инвойс Stars; сервер валидирует successful_payment.
    const validation = await validatePurchaseServerSide(confirmPack.id);
    setPaying(false);
    if (validation.ok) {
      buyPack(confirmPack.id);
    } else {
      toast('Платёж не подтверждён сервером', 'error');
    }
    setConfirmPack(null);
  };

  return (
    <div className="screen-scroll">
      <SectionTitle right={<span className="res-chip">💎 {game.resources.crystals}</span>}>Магазин кристаллов</SectionTitle>

      <div className="col">
        {SHOP_PACKS.map((p) => (
          <div key={p.id} className="list-row">
            <div style={{ fontSize: 26 }}>{p.id === 'starter' ? '🎁' : p.crystals >= 900 ? '👑' : p.crystals >= 400 ? '💠' : '💎'}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 13 }}>
                {p.title} {p.oneTime ? <span className="tiny">(один раз)</span> : null}
              </div>
              <div className="tiny">
                {p.crystals} 💎{p.bonusCrystals ? ` + ${p.bonusCrystals} бонус` : ''}
                {p.extra?.scrolls ? ` · 📜 ${p.extra.scrolls}` : ''}{p.extra?.gold ? ` · 🪙 ${p.extra.gold.toLocaleString('ru-RU')}` : ''}
              </div>
            </div>
            <button
              className="btn btn-sm btn-gold"
              disabled={p.oneTime && game.stats.firstPayment}
              onClick={() => { setConfirmPack(p); }}
            >
              {p.oneTime && game.stats.firstPayment ? '✅ Куплен' : `⭐ ${p.stars}`}
            </button>
          </div>
        ))}
      </div>

      <div className="panel panel-tight" style={{ marginTop: 8 }}>
        <div className="tiny">Цены видны до подтверждения. Оплата — Telegram Stars, разовые покупки (без подписок). Мы продаём время и удобство, а не победу: весь прогресс достижим без платежей.</div>
      </div>

      <SectionTitle>Бесплатно за рекламу</SectionTitle>
      <div className="col">
        <div className="list-row">
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>📺 {AD_REWARDS.crystals50.title}</div>
            <div className="tiny">{AD_REWARDS.crystals50.desc}</div>
          </div>
          <button className="btn btn-sm" disabled={game.adsToday.count >= ADS_PER_DAY} onClick={() => { watchAd('crystals50'); }}>
            {game.adsToday.count >= ADS_PER_DAY ? 'Лимит 5/5' : 'Смотреть'}
          </button>
        </div>
        <div className="list-row">
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>📺 Пропустить бой</div>
            <div className="tiny">Доступно прямо во время боя — награда та же, что при просмотре</div>
          </div>
          <span className="tiny muted">в бою → ⏭</span>
        </div>
        <div className="tiny" style={{ textAlign: 'center' }}>Просмотров сегодня: {game.adsToday.count} / {ADS_PER_DAY} · interstitial-рекламы в игре нет</div>
      </div>
      <div style={{ height: 16 }} />

      {confirmPack ? (
        <Modal title="Подтверждение покупки" onClose={paying ? undefined : () => { setConfirmPack(null); }}>
          <div className="col" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40 }}>⭐</div>
            <div className="title-md">{confirmPack.title}</div>
            <div className="small">{confirmPack.crystals + (confirmPack.bonusCrystals ?? 0)} 💎 за {confirmPack.stars} Telegram Stars ({confirmPack.usdLabel})</div>
            {paying ? (
              <div className="small muted">Проверяем платёж на сервере…</div>
            ) : (
              <div className="row" style={{ gap: 8, justifyContent: 'center', marginTop: 8 }}>
                <button className="btn" onClick={() => { setConfirmPack(null); }}>Отмена</button>
                <button className="btn btn-cta" onClick={() => void pay()}>Оплатить ⭐ {confirmPack.stars}</button>
              </div>
            )}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

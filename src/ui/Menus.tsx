import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';
import { useUi } from '../state/store';
import { WEAPONS, WEAPON_ORDER } from '../game/types';
import { PRICES } from '../game/economy';
import { BRANCH_NAMES, PERK_DEFS } from '../game/perks';
import { TUNING_COSTS } from '../game/economy';

export function Menus(): ReactElement | null {
  const snap = useUi((s) => s.snap);
  const banner = useUi((s) => s.banner);
  const summary = useUi((s) => s.summary);
  const meta = useUi((s) => s.meta);
  const muted = useUi((s) => s.muted);
  const webglFailed = useUi((s) => s.webglFailed);
  const engine = useUi((s) => s.engine);
  const toggleMute = useUi((s) => s.toggleMute);
  const [shopTab, setShopTab] = useState<'gear' | 'weapons' | 'perks'>('gear');

  const start = useCallback(() => { engine?.startRun(); }, [engine]);
  const resume = useCallback(() => { engine?.resume(); }, [engine]);
  const restart = useCallback(() => { engine?.restart(); useUi.getState().clearSummary(); }, [engine]);
  const toMenu = useCallback(() => { engine?.toMenu(); useUi.getState().clearSummary(); }, [engine]);
  const closeShop = useCallback(() => { engine?.closeShop(); }, [engine]);

  if (webglFailed) {
    return (
      <div className="screen">
        <div className="panel">
          <h1 className="title">ХАМСИН</h1>
          <p style={{ color: 'var(--ink-dim)', fontSize: 13, lineHeight: 1.5 }}>
            WebGL недоступен на этом устройстве или заблокирован браузером.
            Обновите страницу либо откройте в Chrome/Safari с аппаратным ускорением.
          </p>
        </div>
      </div>
    );
  }

  const muteBtn = (
    <button type="button" className="menu-btn ghost-btn" aria-label="Звук" onClick={toggleMute}>
      {muted ? '🔇 Звук выкл' : '🔊 Звук вкл'}
    </button>
  );

  // Shop overlay (during skirmish)
  if (snap.shopOpen && snap.phase === 'playing') {
    const xpPct = snap.xpNeed > 0 ? (snap.xpInto / snap.xpNeed) * 100 : 0;
    return (
      <div className="shop-overlay" role="dialog" aria-label="Радио — закупка">
        <div className="shop-head">
          <div>
            <div className="shop-title">📻 РАДИО · ЗАКУПКА</div>
            <div style={{ fontSize: 11, color: 'var(--ink-dim)' }}>💰 {snap.money} · ⚙️ {snap.parts} · ⭐ Ур.{snap.level} · очков: {snap.perkPoints}</div>
            <div className="xp-bar"><div className="xp-fill" style={{ width: `${xpPct}%` }} /></div>
            <div style={{ fontSize: 10, color: 'var(--ink-dim)' }}>{snap.xpInto}/{snap.xpNeed} XP</div>
          </div>
          <button type="button" className="shop-close" aria-label="Закрыть магазин" onClick={closeShop}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {(['gear', 'weapons', 'perks'] as const).map((t) => (
            <button key={t} type="button" className={`menu-btn ${shopTab === t ? 'primary-btn' : ''}`} style={{ flex: 1, minHeight: 38 }} onClick={() => { setShopTab(t); }}>
              {t === 'gear' ? 'Снаряжение' : t === 'weapons' ? 'Оружие' : `Перки (${snap.perkPoints})`}
            </button>
          ))}
        </div>

        {shopTab === 'gear' && (
          <div className="shop-section">
            <div className="shop-grid">
              <ShopCard title="🛡️ Броня" desc={`+50 брони (макс ${snap.armorMax})`} price={PRICES.armor} cur={`🛡️ ${snap.armor}/${snap.armorMax}`} onBuy={() => engine?.buyGear('armor')} />
              <ShopCard title="💣 Граната" desc={`Лимит ${3 + (meta?.perks.includes('mob4') ? 1 : 0)}`} price={PRICES.grenade} cur={`💣 ${snap.grenades}`} onBuy={() => engine?.buyGear('grenade')} />
              <ShopCard title="❤️ Аптечка" desc="Лечит 50 HP" price={PRICES.medkit} cur={`❤️ ${snap.medkits}`} onBuy={() => engine?.buyGear('medkit')} />
              <ShopCard title="🧰 Патроны" desc={`+120 к ${WEAPONS[snap.weapon].name}`} price={PRICES.ammo} cur={`${snap.ammo}/${snap.magSize} · рез. ${snap.reserve < 0 ? '∞' : snap.reserve}`} onBuy={() => engine?.buyGear('ammo')} />
            </div>
            <button type="button" className="menu-btn" onClick={() => engine?.callWaveEarly()} style={{ marginTop: 12 }}>
              ⚡ Вызвать волну досрочно (+{Math.ceil(snap.intermissionT) * 6}₽ бонус)
            </button>
          </div>
        )}

        {shopTab === 'weapons' && (
          <div className="shop-section">
            <div className="shop-grid">
              {WEAPON_ORDER.map((id) => {
                const spec = WEAPONS[id];
                const owned = snap.owned.includes(id);
                const tier = snap.tuning[id];
                const nextCost = !owned ? null : tier < 3 ? TUNING_COSTS[tier] : null;
                return (
                  <div key={id} className="shop-card">
                    <h4>{spec.name} {owned ? `· T${tier}` : ''}</h4>
                    <p>{spec.dmg} урона · {spec.rpm} выстр/мин · маг {spec.mag} · {spec.price ? `${spec.price}₽` : 'штатное'}</p>
                    <p style={{ fontSize: 10, color: 'var(--ink-dim)' }}>Ур.{spec.unlockLevel} · вес ×{spec.moveMult}</p>
                    {!owned ? (
                      <button type="button" onClick={() => engine?.buyWeapon(id)} disabled={snap.money < spec.price}>
                        Купить · {spec.price}₽
                      </button>
                    ) : (
                      <>
                        <button type="button" onClick={() => engine?.equipWeapon(id)} disabled={snap.weapon === id}>
                          {snap.weapon === id ? '✓ В руках' : 'Взять'}
                        </button>
                        {nextCost && (
                          <button type="button" onClick={() => engine?.tuneWeapon(id)} disabled={snap.money < nextCost.money || snap.parts < nextCost.parts}>
                            Тюнинг T{tier + 1} · {nextCost.money}₽ + {nextCost.parts}⚙️
                          </button>
                        )}
                        {!nextCost && <div style={{ fontSize: 11, color: 'var(--gold)', marginTop: 6 }}>Макс. тир</div>}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {shopTab === 'perks' && (
          <div className="shop-section">
            <div style={{ fontSize: 11, color: 'var(--ink-dim)', marginBottom: 8 }}>Очков: {snap.perkPoints} · сохраняются между забегами</div>
            {(['sur', 'gun', 'mob'] as const).map((branch) => (
              <div key={branch} style={{ marginBottom: 10 }}>
                <h3>{BRANCH_NAMES[branch]}</h3>
                <div className="perk-grid">
                  {PERK_DEFS.filter((p) => p.branch === branch).map((perk) => {
                    const taken = meta?.perks.includes(perk.id) === true;
                    const canTake = !taken && (perk.requires === null || meta?.perks.includes(perk.requires) === true) && snap.perkPoints > 0;
                    const locked = !taken && !canTake;
                    return (
                      <div key={perk.id} className={`perk-row ${taken ? 'taken' : ''} ${locked ? 'locked' : ''}`}>
                        <div className="perk-info">
                          <div className="perk-name">{perk.name} {taken ? '✓' : ''}</div>
                          <div className="perk-desc">{perk.desc}</div>
                        </div>
                        {!taken && (
                          <button type="button" className="perk-btn" disabled={locked} onClick={() => engine?.takePerk(perk.id)}>
                            Взять
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (snap.phase === 'menu') {
    return (
      <div className="screen">
        <div className="panel">
          <div className="title-orb" aria-hidden="true">🏜️</div>
          <h1 className="title">ХАМСИН</h1>
          <p className="subtitle">FPS-выживание · Рубеж-9 · волны + вылазки</p>
          {meta && meta.bestWave > 0 && <div className="best-chip">Рекорд: волна {meta.bestWave} · {meta.bestScore} очков</div>}
          <button type="button" className="menu-btn primary-btn" aria-label="Начать игру" onClick={start}>▶ В БОЙ</button>
          {muteBtn}
          <div className="howto">
            <div>🕹 Левая зона — движение (край = бег)</div>
            <div>👆 Правая зона — прицел свайпом</div>
            <div>🔥 Удерживай огонь · ⟳ перезарядка · 🦆 присед</div>
            <div>💣 Граната · ❤️ Аптечка · » Рывок (перк) · 📻 Радио — магазин между волнами</div>
            <div>Оригинальная карта «Рубеж-9» в эстетике пыльной пустыни — ящики, арки, длинные прострелы.</div>
          </div>
        </div>
      </div>
    );
  }

  if (snap.phase === 'paused') {
    return (
      <div className="screen dim">
        <div className="panel">
          <h1 className="title small">ПАУЗА</h1>
          <button type="button" className="menu-btn primary-btn" aria-label="Продолжить" onClick={resume}>▶ Продолжить</button>
          <button type="button" className="menu-btn" aria-label="Заново" onClick={restart}>⟲ Заново</button>
          <button type="button" className="menu-btn" aria-label="В меню" onClick={toMenu}>🏠 В меню</button>
          {muteBtn}
        </div>
      </div>
    );
  }

  if (snap.phase === 'over' && summary) {
    const isNewBest = summary.bestWave === summary.wave && summary.wave > 0;
    return (
      <div className="screen dim">
        <div className="panel">
          <h1 className="title dead">ВЫ ПАЛИ</h1>
          {isNewBest && <div className="best-chip glow">🏆 Новый рекорд волны!</div>}
          <div className="stats">
            <div className="stat"><span>Волна</span><b>{summary.wave}</b></div>
            <div className="stat"><span>Убито</span><b>{summary.kills}</b></div>
            <div className="stat"><span>Очки</span><b>{summary.score}</b></div>
            <div className="stat"><span>Уровень</span><b>{summary.level}</b></div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-dim)', marginBottom: 8 }}>XP за забег: +{summary.xpRun} · рекорд: волна {summary.bestWave} · {summary.bestScore}</div>
          <button type="button" className="menu-btn primary-btn" aria-label="Играть заново" onClick={restart}>⟲ Ещё раз</button>
          <button type="button" className="menu-btn" aria-label="В меню" onClick={toMenu}>🏠 В меню</button>
        </div>
      </div>
    );
  }

  // banner during play (also shown via Hud, but keep here for menu context)
  if (banner && snap.phase === 'playing') {
    return null; // Hud already shows it
  }

  return null;
}

function ShopCard({ title, desc, price, cur, onBuy }: { title: string; desc: string; price: number; cur: string; onBuy: () => void }): ReactElement {
  return (
    <div className="shop-card">
      <h4>{title}</h4>
      <p>{desc}</p>
      <div className="shop-price">{price}₽ · {cur}</div>
      <button type="button" onClick={onBuy}>Купить</button>
    </div>
  );
}

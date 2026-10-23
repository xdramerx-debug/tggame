import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { getHeroDef } from '../game/heroes';
import {
  ORDINARY_COST_GOLD, ORDINARY_COST_SCROLLS, ORDINARY_RATES, PREMIUM_10_COST_CRYSTALS,
  PREMIUM_COST_CRYSTALS, PREMIUM_PITY, PREMIUM_RATES,
} from '../game/gacha';
import { FACTION_META } from '../game/constants';
import { fmt, useGameStore } from '../state/gameStore';
import { Modal, Stars } from '../components/ui';
import { playSfx } from '../platform/audio';

/**
 * Summon (§5): two banners, public odds behind «i», visible pity counter,
 * 1.5–2.5s animation with a beat before the reveal, duplicates auto-convert
 * to shards, 3★ become fodder.
 */
export function SummonScreen(): ReactElement {
  const game = useGameStore((s) => s.game);
  const doSummon = useGameStore((s) => s.doSummon);
  const results = useGameStore((s) => s.summonResults);
  const closeResults = useGameStore((s) => s.closeSummonResults);
  const watchAd = useGameStore((s) => s.watchAd);

  const [banner, setBanner] = useState<'ordinary' | 'premium'>('ordinary');
  const [showRates, setShowRates] = useState(false);

  const pityLeft = PREMIUM_PITY - game.pity.premium;
  const canOrdinary = game.resources.scrolls >= ORDINARY_COST_SCROLLS || game.resources.gold >= ORDINARY_COST_GOLD;
  const canPremium = game.resources.crystals >= PREMIUM_COST_CRYSTALS;
  const canPremium10 = game.resources.crystals >= PREMIUM_10_COST_CRYSTALS;

  const summon = (count: 1 | 10): void => {
    if (banner === 'ordinary') {
      const pay = game.resources.scrolls >= count * ORDINARY_COST_SCROLLS ? 'scrolls' : 'gold';
      doSummon('ordinary', count, pay);
    } else {
      doSummon('premium', count, 'crystals');
    }
  };

  return (
    <div className="screen-scroll">
      <div className="seg" style={{ marginBottom: 12 }}>
        <button className={banner === 'ordinary' ? 'on' : ''} onClick={() => { setBanner('ordinary'); }}>🌀 Врата Эха</button>
        <button className={banner === 'premium' ? 'on' : ''} onClick={() => { setBanner('premium'); }}>💎 Высший призыв</button>
      </div>

      <div className="panel" style={{ textAlign: 'center', background: 'linear-gradient(160deg, var(--panel2), var(--panel))' }}>
        <div className="summon-orb">{banner === 'ordinary' ? '🌀' : '💠'}</div>
        <div className="title-lg" style={{ marginTop: 6 }}>{banner === 'ordinary' ? 'Врата Эха' : 'Высший призыв'}</div>
        <div className="small muted" style={{ margin: '4px 0 10px' }}>
          {banner === 'ordinary'
            ? 'Обычный призыв: 3–5★ герои. Дубликаты → шарды, 3★ → «еда» 🍖'
            : `Премиум-призыв: 4★+, шанс 5★ — 12%. До гарантированного 5★: ${pityLeft} призыв(а)`}
        </div>

        <div className="row" style={{ justifyContent: 'center', marginBottom: 10 }}>
          <button className="btn btn-sm" onClick={() => { setShowRates(true); }}>ℹ️ Вероятности</button>
          {banner === 'premium' ? <span className="res-chip">🎯 Гарант через {pityLeft}</span> : null}
          <span className="res-chip">🔷 Шарды: {fmt(game.resources.shards)}</span>
        </div>

        <div className="col" style={{ gap: 8 }}>
          {banner === 'ordinary' ? (
            <>
              <button className="btn btn-cta btn-wide" disabled={!canOrdinary} onClick={() => { summon(1); }}>
                Призыв x1 — {game.resources.scrolls >= 1 ? `📜 ${ORDINARY_COST_SCROLLS} свиток` : `${fmt(ORDINARY_COST_GOLD)} 🪙`}
              </button>
              <button className="btn btn-wide" disabled={game.resources.scrolls < 10 && game.resources.gold < ORDINARY_COST_GOLD * 10} onClick={() => { summon(10); }}>
                Призыв x10 — {game.resources.scrolls >= 10 ? `📜 ${ORDINARY_COST_SCROLLS * 10} свитков` : `${fmt(ORDINARY_COST_GOLD * 10)} 🪙`}
              </button>
              <button className="btn btn-sm btn-wide" onClick={() => { watchAd('crystals50'); }}>📺 Реклама: +50 💎 (осталось {5 - game.adsToday.count}/5)</button>
            </>
          ) : (
            <>
              <button className="btn btn-cta btn-wide" disabled={!canPremium} onClick={() => { summon(1); }}>
                Призыв x1 — {PREMIUM_COST_CRYSTALS} 💎
              </button>
              <button className="btn btn-gold btn-wide" disabled={!canPremium10} onClick={() => { summon(10); }}>
                Призыв x10 — {PREMIUM_10_COST_CRYSTALS} 💎 (выгода 10%)
              </button>
              <div className="tiny">Кристаллы: {fmt(game.resources.crystals)} 💎 · пополнить — во вкладке «Ещё» → «Магазин»</div>
            </>
          )}
        </div>
      </div>

      <div className="panel panel-tight" style={{ marginTop: 12 }}>
        <div className="tiny">Всего призывов: {game.stats.summons} · Дубликаты конвертируются в шарды автоматически</div>
      </div>

      {/* Rates modal — odds visible BEFORE pressing (§5) */}
      {showRates ? (
        <Modal title="Вероятности призыва" onClose={() => { setShowRates(false); }}>
          <div className="col">
            <b>🌀 Врата Эха (обычный)</b>
            {ORDINARY_RATES.map((r) => (
              <div key={r.rarity} className="row-between"><span><Stars rarity={r.rarity} /> герой</span><b>{Math.round(r.p * 100)}%</b></div>
            ))}
            <div className="tiny">3★ дубликаты становятся «едой» 🍖, 4–5★ дубликаты — шардами 🔷</div>
            <b style={{ marginTop: 8 }}>💎 Высший призыв (премиум)</b>
            {PREMIUM_RATES.map((r) => (
              <div key={r.rarity} className="row-between"><span><Stars rarity={r.rarity} /> герой</span><b>{Math.round(r.p * 100)}%</b></div>
            ))}
            <div className="tiny">Гарант (pity): 5★ не позднее {PREMIUM_PITY}-го призыва. Счётчик виден на экране.</div>
          </div>
        </Modal>
      ) : null}

      {/* Reveal modal with animation */}
      {results ? <SummonReveal onClose={closeResults} /> : null}
      <div style={{ height: 16 }} />
    </div>
  );
}

function SummonReveal({ onClose }: { onClose: () => void }): ReactElement {
  const results = useGameStore((s) => s.summonResults) ?? [];
  const [stage, setStage] = useState<'orb' | 'reveal'>('orb');

  useEffect(() => {
    playSfx('summon');
    const t = window.setTimeout(() => { setStage('reveal'); }, 1800); // задержка перед появлением (§5)
    return () => { window.clearTimeout(t); };
  }, []);

  if (stage === 'orb') {
    return (
      <Modal>
        <div className="col" style={{ alignItems: 'center', padding: '30px 0' }}>
          <div className="summon-orb">🌌</div>
          <div className="title-md" style={{ marginTop: 10 }}>Врата открываются…</div>
        </div>
      </Modal>
    );
  }

  const best = Math.max(...results.map((r) => r.rarity));
  return (
    <Modal title="Результат призыва" onClose={onClose} wide>
      {best === 5 ? <div className="title-md rarity-legendary" style={{ textAlign: 'center', marginBottom: 8 }}>✦ ЛЕГЕНДАРНЫЙ ГЕРОЙ! ✦</div> : null}
      <div className={`summon-grid ${results.length === 1 ? '' : ''}`} style={results.length === 1 ? { gridTemplateColumns: '1fr' } : undefined}>
        {results.map((r, i) => {
          const d = getHeroDef(r.heroId);
          return (
            <div key={i} className="reveal-card panel panel-tight" style={{ animationDelay: `${i * 90}ms`, textAlign: 'center', padding: 6 }}>
              <div style={{ fontSize: results.length === 1 ? 56 : 26 }}>{d.emoji}</div>
              <div style={{ fontWeight: 800, fontSize: results.length === 1 ? 16 : 8 }}>{d.name}</div>
              <Stars rarity={r.rarity} />
              <div className="tiny" style={{ color: FACTION_META[d.faction].color }}>{FACTION_META[d.faction].name}</div>
              <div className="tiny">
                {r.isDuplicate ? '🔷 дубликат → шарды' : r.isFodder ? '🍖 «еда»' : '✨ НОВЫЙ ГЕРОЙ'}
              </div>
            </div>
          );
        })}
      </div>
      <button className="btn btn-cta btn-wide" style={{ marginTop: 12 }} onClick={onClose}>Забрать</button>
      <div className="tiny" style={{ marginTop: 6, textAlign: 'center' }}>Дубликаты уже превратились в шарды автоматически</div>
    </Modal>
  );
}

import type { ReactElement } from 'react';
import { useUi } from '../state/store';

/** In-game HUD: HP, wave, score, combo, banners, damage feedback. */

export function Hud(): ReactElement | null {
  const snap = useUi((s) => s.snap);
  const bannerWave = useUi((s) => s.bannerWave);
  const toast = useUi((s) => s.toast);
  const hurtTick = useUi((s) => s.hurtTick);
  const killTick = useUi((s) => s.killTick);
  const lastKillHeadshot = useUi((s) => s.lastKillHeadshot);
  const lastKillGained = useUi((s) => s.lastKillGained);

  if (snap.phase !== 'playing' && snap.phase !== 'paused') return null;

  const hpFrac = Math.max(0, Math.min(1, snap.hp / snap.maxHp));
  const lowHp = snap.hp <= 30;
  const intermission = snap.waveState === 'intermission' && snap.phase === 'playing';

  return (
    <div className="hud">
      <div className="hud-top">
        <div className="hp-block">
          <div className="hp-bar" role="img" aria-label={`Здоровье ${snap.hp} из ${snap.maxHp}`}>
            <div
              className={`hp-fill${lowHp ? ' hp-low' : ''}`}
              style={{ width: `${(hpFrac * 100).toFixed(1)}%` }}
            />
          </div>
          <div className="hp-text">{snap.hp}</div>
        </div>

        <div className="wave-block">
          <div className="wave-label">ВОЛНА {snap.wave}</div>
          {intermission ? (
            <div className="wave-sub">следующая через {snap.intermissionT}…</div>
          ) : (
            <div className="wave-sub">зомби: {snap.zombiesLeft}</div>
          )}
        </div>

        <div className="score-block">
          <div className="score-num">{snap.score}</div>
          <div className="score-sub">💀 {snap.kills}</div>
        </div>
      </div>

      {snap.rapidT > 0 && (
        <div className="buff-chip">🔥 Шквал {snap.rapidT.toFixed(0)}с</div>
      )}

      {snap.combo > 1 && (
        <div className="combo-chip" key={snap.combo}>
          ×{snap.comboMult.toFixed(1)} <span>комбо {snap.combo}</span>
        </div>
      )}

      <div className="crosshair" aria-hidden="true" />

      {snap.reloading && (
        <div className="reload-bar">
          <div className="reload-fill" style={{ width: `${(snap.reloadProgress * 100).toFixed(1)}%` }} />
        </div>
      )}

      {lowHp && <div className="low-hp-vignette" aria-hidden="true" />}
      {hurtTick > 0 && <div className="hurt-flash" key={hurtTick} aria-hidden="true" />}
      {killTick > 0 && (
        <div className={`kill-marker${lastKillHeadshot ? ' kill-head' : ''}`} key={killTick}>
          {lastKillHeadshot ? '☠ ' : ''}+{lastKillGained}
        </div>
      )}

      {bannerWave !== null && (
        <div className="wave-banner" key={bannerWave}>
          <div className="banner-main">ВОЛНА {bannerWave}</div>
          <div className="banner-sub">они идут…</div>
        </div>
      )}

      {toast !== null && <div className="toast-chip" key={toast}>{toast}</div>}
    </div>
  );
}

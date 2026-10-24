import type { ReactElement } from 'react';
import { useUi } from '../state/store';

export function Hud(): ReactElement | null {
  const snap = useUi((s) => s.snap);
  const banner = useUi((s) => s.banner);
  const toast = useUi((s) => s.toast);
  const killfeed = useUi((s) => s.killfeed);
  const hurtTick = useUi((s) => s.hurtTick);
  const hitmarkTick = useUi((s) => s.hitmarkTick);
  const hitHead = useUi((s) => s.hitHead);

  if (snap.phase !== 'playing' && snap.phase !== 'paused') return null;

  const hpFrac = snap.maxHp > 0 ? snap.hp / snap.maxHp : 0;
  const armorFrac = snap.armorMax > 0 ? snap.armor / snap.armorMax : 0;
  const lowHp = snap.hp <= 30 && snap.hp > 0;
  const isSkirmish = snap.run === 'skirmish';

  return (
    <div className="hud">
      <div className="hud-top">
        <div className="hp-armor">
          <div className="bar-row">
            <span className="bar-icon">❤️</span>
            <div className="bar" role="img" aria-label={`Здоровье ${snap.hp} из ${snap.maxHp}`}>
              <div className={`bar-fill hp${lowHp ? ' low' : ''}`} style={{ width: `${(hpFrac * 100).toFixed(1)}%` }} />
            </div>
            <span className="bar-text">{snap.hp}</span>
          </div>
          <div className="bar-row">
            <span className="bar-icon">🛡️</span>
            <div className="bar" role="img" aria-label={`Броня ${snap.armor} из ${snap.armorMax}`}>
              <div className="bar-fill armor" style={{ width: `${(armorFrac * 100).toFixed(1)}%` }} />
            </div>
            <span className="bar-text">{snap.armor}</span>
          </div>
        </div>

        <div className="wave-block">
          <div className="wave-label">ВОЛНА {snap.wave}</div>
          {isSkirmish ? (
            <div className="wave-sub good">вылазка · {snap.intermissionT.toFixed(0)}с</div>
          ) : (
            <div className={`wave-sub ${snap.enemiesLeft > 8 ? 'elite' : ''}`}>врагов: {snap.enemiesLeft}</div>
          )}
          <div className="econ-row">
            <span className="econ-chip">💰 {snap.money}</span>
            <span className="econ-chip parts">⚙️ {snap.parts}</span>
          </div>
        </div>

        <div className="score-block">
          <div className="score-num">{snap.score}</div>
          <div className="score-sub">💀 {snap.kills}</div>
          <div className="score-sub">⭐ Ур.{snap.level}</div>
        </div>
      </div>

      <div className="crosshair" aria-hidden="true" />
      {hitmarkTick > 0 && <div className={`hitmark${hitHead ? ' head' : ''}`} key={hitmarkTick} aria-hidden="true" />}

      {snap.reloading && (
        <div className="reload-bar">
          <div className="reload-fill" style={{ width: `${(snap.reloadProgress * 100).toFixed(1)}%` }} />
        </div>
      )}

      {lowHp && <div className="low-hp-vignette" aria-hidden="true" />}
      {hurtTick > 0 && <div className="hurt-flash" key={hurtTick} aria-hidden="true" />}

      {banner && (
        <div className="banner" key={banner.title}>
          <div className={`banner-main ${banner.tone}`}>{banner.title}</div>
          <div className="banner-sub">{banner.sub}</div>
        </div>
      )}

      {toast && <div className="toast-chip">{toast}</div>}

      <div className="killfeed" aria-live="polite">
        {killfeed.map((k) => (
          <div key={k.id} className={`kill-entry${k.head ? ' head' : ''}${k.elite ? ' elite' : ''}`}>
            {k.text}
          </div>
        ))}
      </div>

      <Minimap />
      <WeaponBar />
    </div>
  );
}

function Minimap(): ReactElement | null {
  const snap = useUi((s) => s.snap);
  if (snap.phase !== 'playing') return null;
  const size = 108;
  const half = 40;
  const toPx = (v: number): number => ((v + half) / (half * 2)) * size;
  return (
    <div className="minimap" aria-label="Миникарта" role="img">
      <div className="minimap-grid" />
      {snap.minimap.map((d, i) => (
        <div
          key={`${d.x}-${d.z}-${i}`}
          className={`mmap-dot ${d.k}`}
          style={{ left: toPx(d.x), top: toPx(d.z) }}
        />
      ))}
      <div
        className="mmap-player"
        style={{
          left: toPx(snap.px),
          top: toPx(snap.pz),
          transform: `translate(-50%,-50%) rotate(${snap.pyaw}rad)`,
        }}
      />
    </div>
  );
}

function WeaponBar(): ReactElement | null {
  const snap = useUi((s) => s.snap);
  if (snap.phase !== 'playing') return null;
  const icons: Record<string, string> = { pistol: '🔫', smg: '🔫', rifle: '🎯', shotgun: '💥', sniper: '🔭' };
  const order: typeof snap.owned = ['pistol', 'smg', 'rifle', 'shotgun', 'sniper'];
  return (
    <div className="weapon-bar" aria-label="Оружие">
      {order.map((id) => {
        const owned = snap.owned.includes(id);
        const active = snap.weapon === id;
        const tier = snap.tuning[id];
        return (
          <div key={id} className={`wep-slot${active ? ' active' : ''}${owned ? ' owned' : ''}`}>
            <span className="wep-icon">{icons[id] ?? '🔫'}</span>
            <span className="wep-tier">{owned ? `T${tier}` : '—'}</span>
          </div>
        );
      })}
    </div>
  );
}

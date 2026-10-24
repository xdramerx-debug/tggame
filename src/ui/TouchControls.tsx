import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement, RefObject } from 'react';
import { useUi } from '../state/store';

export function TouchControls({ leftRef }: { leftRef: RefObject<HTMLDivElement>; rightRef: RefObject<HTMLDivElement> }): ReactElement | null {
  const snap = useUi((s) => s.snap);
  const engine = useUi((s) => s.engine);
  const joyRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const [joyActive, setJoyActive] = useState(false);

  // joystick visual follows InputManager state via polling
  useEffect(() => {
    if (snap.phase !== 'playing' || snap.shopOpen) {
      setJoyActive(false);
      return;
    }
    let raf = 0;
    const update = (): void => {
      const input = engine?.input;
      const left = leftRef.current;
      const joy = joyRef.current;
      const knob = knobRef.current;
      if (!input || !left || !joy || !knob) {
        raf = requestAnimationFrame(update);
        return;
      }
      // Access private-ish via snapshot and internal fields: use snapshot move
      const s = input.snapshot();
      const mag = Math.hypot(s.moveX, s.moveY);
      if (mag > 0.08) {
        const rect = left.getBoundingClientRect();
        // we don't have origin, estimate center of left zone
        joy.style.left = `${rect.left + rect.width * 0.35}px`;
        joy.style.top = `${rect.top + rect.height * 0.62}px`;
        joy.classList.add('active');
        knob.style.transform = `translate(calc(-50% + ${s.moveX * 34}px), calc(-50% + ${-s.moveY * 34}px))`;
        setJoyActive(true);
      } else {
        joy.classList.remove('active');
        setJoyActive(false);
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => { cancelAnimationFrame(raf); };
  }, [engine, leftRef, snap.phase, snap.shopOpen]);

  const fireDown = useCallback(() => { engine?.input.setFire(true); }, [engine]);
  const fireUp = useCallback(() => { engine?.input.setFire(false); }, [engine]);

  if (snap.phase !== 'playing') return null;
  if (snap.shopOpen) return null;

  const reserveLabel = snap.reserve < 0 ? '∞' : String(snap.reserve);
  const reloadPct = snap.reloading ? `${(snap.reloadProgress * 100).toFixed(0)}%` : '';

  return (
    <div className="controls" aria-hidden={false}>
      <div ref={joyRef} className="joy-base" aria-hidden="true">
        <div ref={knobRef} className="joy-knob" />
      </div>

      <button type="button" className="ctl pause-btn" aria-label="Пауза" onClick={() => engine?.pause()}>
        ⏸
      </button>

      <div className="bottom-left">
        <button
          type="button"
          className="ctl small-btn"
          aria-label="Прыжок"
          onPointerDown={() => engine?.input.pressJump()}
        >
          ⤒
        </button>
        <button
          type="button"
          className="ctl small-btn"
          aria-label="Присед"
          onPointerDown={() => engine?.input.pressCrouch()}
        >
          {snap.hp > 0 && engine ? '🦆' : '⬇'}
        </button>
        <button
          type="button"
          className="ctl small-btn"
          aria-label="Рывок"
          onPointerDown={() => engine?.input.pressDash()}
          style={{ opacity: snap.dashReady > 0.99 ? 1 : 0.45 }}
        >
          »
        </button>
      </div>

      <div className="ctl-cluster">
        <div className="ammo-chip" aria-label={`Патроны ${snap.ammo} из ${snap.magSize}, запас ${reserveLabel}`}>
          <span className={`ammo-num${snap.ammo === 0 ? ' empty' : ''}`}>{snap.ammo}</span>
          <span className="ammo-sep">/</span>
          <span className="ammo-mag">{snap.magSize}</span>
          <span className="ammo-sep">·</span>
          <span className="ammo-mag">{reserveLabel}</span>
          {snap.reloading && <span className="ammo-mag"> {reloadPct}</span>}
        </div>
        <div className="ctl-row">
          <button type="button" className="ctl small-btn" aria-label="Перезарядка" onPointerDown={() => engine?.input.pressReload()}>
            ⟳
          </button>
          <button
            type="button"
            className="ctl fire-btn"
            aria-label="Огонь"
            onPointerDown={fireDown}
            onPointerUp={fireUp}
            onPointerLeave={fireUp}
            onPointerCancel={fireUp}
          >
            🔥
          </button>
        </div>
        <div className="ctl-row">
          <button type="button" className="ctl small-btn" aria-label="Граната" onPointerDown={() => engine?.input.pressGrenade()}>
            💣 {snap.grenades}
          </button>
          <button type="button" className="ctl small-btn" aria-label="Аптечка" onPointerDown={() => engine?.input.pressMedkit()}>
            ❤️ {snap.medkits}
          </button>
          <button type="button" className="ctl small-btn" aria-label="Радио" onClick={() => engine?.openShop()}>
            📻
          </button>
        </div>
      </div>

      {/* Invisible hint for testing: show joystick active state */}
      <span data-testid="joy-state" style={{ display: 'none' }}>{joyActive ? 'active' : 'idle'}</span>
    </div>
  );
}

import { useCallback } from 'react';
import { useUi } from '../state/store';
import type { PointerEvent as RPointerEvent, ReactElement } from 'react';

/**
 * On-screen controls: FIRE (hold = auto), DASH, RELOAD, PAUSE.
 * Buttons write straight into engine.input — no React state per frame.
 * All targets ≥ 48 px, anchored with safe-area insets.
 */

export function TouchControls(): ReactElement | null {
  const phase = useUi((s) => s.snap.phase);
  const dashReady = useUi((s) => s.snap.dashReady);
  const ammo = useUi((s) => s.snap.ammo);
  const magSize = useUi((s) => s.snap.magSize);

  const setFire = useCallback((down: boolean) => {
    const g = useUi.getState().engine;
    if (g) g.input.fireHeld = down;
  }, []);

  const onFireDown = useCallback((e: RPointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setFire(true);
  }, [setFire]);

  const onFireUp = useCallback(() => { setFire(false); }, [setFire]);

  const onDash = useCallback(() => {
    const g = useUi.getState().engine;
    if (g) g.input.dashQueued = true;
  }, []);

  const onReload = useCallback(() => {
    const g = useUi.getState().engine;
    if (g) g.input.reloadQueued = true;
  }, []);

  const onPause = useCallback(() => {
    useUi.getState().engine?.pause();
  }, []);

  if (phase !== 'playing') return null;

  return (
    <div className="controls">
      <button
        type="button"
        className="ctl pause-btn"
        aria-label="Пауза"
        onPointerDown={onPause}
      >
        ⏸
      </button>

      <div className="ctl-cluster">
        <div className="ammo-chip" aria-hidden="true">
          <span className={`ammo-num${ammo === 0 ? ' ammo-empty' : ''}`}>{ammo}</span>
          <span className="ammo-sep">/</span>
          <span className="ammo-mag">{magSize}</span>
        </div>
        <div className="ctl-row">
          <button
            type="button"
            className="ctl small-btn"
            aria-label="Перезарядка"
            onPointerDown={onReload}
          >
            ⟳
          </button>
          <button
            type="button"
            className="ctl small-btn dash-btn"
            aria-label="Рывок"
            onPointerDown={onDash}
            style={{ opacity: dashReady >= 1 ? 1 : 0.45 + dashReady * 0.5 }}
          >
            »
          </button>
          <button
            type="button"
            className="ctl fire-btn"
            aria-label="Огонь"
            onPointerDown={onFireDown}
            onPointerUp={onFireUp}
            onPointerCancel={onFireUp}
          >
            🔥
          </button>
        </div>
      </div>
    </div>
  );
}

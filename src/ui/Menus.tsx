import { useCallback } from 'react';
import type { ReactElement } from 'react';
import { useUi } from '../state/store';
import { playSfx } from '../engine/audio';

/** Menu / pause / game-over / WebGL-fallback screens. */

export function Menus(): ReactElement | null {
  const phase = useUi((s) => s.snap.phase);
  const snap = useUi((s) => s.snap);
  const best = useUi((s) => s.best);
  const newBest = useUi((s) => s.newBest);
  const muted = useUi((s) => s.muted);
  const webglFailed = useUi((s) => s.webglFailed);
  const toggleMute = useUi((s) => s.toggleMute);

  const start = useCallback(() => {
    playSfx('uiClick');
    useUi.getState().engine?.startRun();
  }, []);
  const resume = useCallback(() => {
    playSfx('uiClick');
    useUi.getState().engine?.resume();
  }, []);
  const restart = useCallback(() => {
    playSfx('uiClick');
    useUi.getState().engine?.restart();
  }, []);
  const toMenu = useCallback(() => {
    playSfx('uiClick');
    useUi.getState().engine?.toMenu();
  }, []);

  if (webglFailed) {
    return (
      <div className="screen">
        <div className="panel">
          <h1 className="title">МЁРТВАЯ ЗОНА</h1>
          <p className="fail-text">
            WebGL недоступен на этом устройстве или заблокирован браузером.
            Обновите страницу либо откройте игру в Chrome/Safari с аппаратным ускорением.
          </p>
        </div>
      </div>
    );
  }

  const muteBtn = (
    <button
      type="button"
      className="menu-btn ghost-btn"
      aria-label="Звук"
      onClick={toggleMute}
    >
      {muted ? '🔇 Звук выкл' : '🔊 Звук вкл'}
    </button>
  );

  if (phase === 'menu') {
    return (
      <div className="screen">
        <div className="panel">
          <div className="title-orb" aria-hidden="true">🧟</div>
          <h1 className="title">МЁРТВАЯ ЗОНА</h1>
          <p className="subtitle">3D-шутер · выживание среди волн</p>
          {best > 0 && <div className="best-chip">Рекорд: {best}</div>}
          <button type="button" className="menu-btn primary-btn" aria-label="Начать игру" onClick={start}>
            ▶ В БОЙ
          </button>
          {muteBtn}
          <div className="howto">
            <div>🕹 Левая половина экрана — движение</div>
            <div>👆 Правая половина — камера</div>
            <div>🔥 Держи «Огонь» — автоматическая стрельба</div>
            <div>» Рывок спасает в окружении, ⟳ — перезарядка</div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'paused') {
    return (
      <div className="screen dim">
        <div className="panel">
          <h1 className="title small">ПАУЗА</h1>
          <button type="button" className="menu-btn primary-btn" aria-label="Продолжить" onClick={resume}>
            ▶ Продолжить
          </button>
          <button type="button" className="menu-btn" aria-label="Заново" onClick={restart}>
            ⟲ Заново
          </button>
          <button type="button" className="menu-btn" aria-label="В меню" onClick={toMenu}>
            🏠 В меню
          </button>
          {muteBtn}
        </div>
      </div>
    );
  }

  if (phase === 'over') {
    return (
      <div className="screen dim">
        <div className="panel">
          <h1 className="title dead">ТЫ ПАЛ</h1>
          {newBest && <div className="best-chip glow">🏆 Новый рекорд!</div>}
          <div className="stats">
            <div className="stat"><span>Волна</span><b>{snap.wave}</b></div>
            <div className="stat"><span>Убито</span><b>{snap.kills}</b></div>
            <div className="stat"><span>Очки</span><b>{snap.score}</b></div>
            <div className="stat"><span>Рекорд</span><b>{best}</b></div>
          </div>
          <button type="button" className="menu-btn primary-btn" aria-label="Играть заново" onClick={restart}>
            ⟲ Ещё раз
          </button>
          <button type="button" className="menu-btn" aria-label="В меню" onClick={toMenu}>
            🏠 В меню
          </button>
        </div>
      </div>
    );
  }

  return null;
}

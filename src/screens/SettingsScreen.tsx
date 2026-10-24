import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { GAME_NAME, SAVE_KEY } from '../game/constants';
import { isDevMode, isTelegram } from '../platform/telegram';
import { recentEvents } from '../platform/analytics';
import { useGameStore } from '../state/gameStore';
import { Modal, SectionTitle } from '../components/ui';

/**
 * Settings (§15.4): visible «Ввести промокод» for players, a HIDDEN dev field
 * behind a 3-second long-press on the version footer, code history, mute,
 * theme check for Telegram dark/light, and dev tools.
 */
export function SettingsScreen(): ReactElement {
  const game = useGameStore((s) => s.game);
  const toggleMute = useGameStore((s) => s.toggleMute);
  const setTheme = useGameStore((s) => s.setTheme);
  const submitCode = useGameStore((s) => s.submitCode);
  const setDevFlag = useGameStore((s) => s.setDevFlag);
  const resetGame = useGameStore((s) => s.resetGame);
  const toast = useGameStore((s) => s.toast);

  const [promoOpen, setPromoOpen] = useState(false);
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const [input, setInput] = useState('');
  const [checking, setChecking] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const pressTimer = useRef<number | null>(null);

  const dev = isDevMode();
  const tg = isTelegram();

  const startPress = (): void => {
    pressTimer.current = window.setTimeout(() => {
      setHiddenOpen(true); // долгий тап 3 секунды (§15.1)
    }, 3000);
  };
  const endPress = (): void => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };
  useEffect(() => endPress, []);

  const submit = (): void => {
    const raw = input.trim();
    if (raw.length === 0) return;
    setChecking(true);
    // короткая анимация «проверка» 0.5–1 сек (§15.1)
    window.setTimeout(() => {
      submitCode(raw);
      setChecking(false);
      setInput('');
      setPromoOpen(false);
      setHiddenOpen(false);
    }, 700);
  };

  return (
    <div className="screen-scroll">
      <SectionTitle>Настройки</SectionTitle>

      <div className="panel col" style={{ gap: 10 }}>
        <div className="row-between">
          <b style={{ fontSize: 13 }}>🔊 Звук и музыка</b>
          <button className="btn btn-sm" onClick={toggleMute}>{game.settings.muted ? '🔇 Выключен' : '🔊 Включен'}</button>
        </div>
        <div className="row-between">
          <div>
            <b style={{ fontSize: 13 }}>🎨 Тема</b>
            <div className="tiny">Проверьте читаемость в тёмной и светлой теме Telegram</div>
          </div>
          <div className="seg" style={{ width: 150 }}>
            <button className={game.settings.theme === 'dark' ? 'on' : ''} onClick={() => { setTheme('dark'); }}>🌙</button>
            <button className={game.settings.theme === 'light' ? 'on' : ''} onClick={() => { setTheme('light'); }}>☀️</button>
          </div>
        </div>
        <div className="row-between">
          <b style={{ fontSize: 13 }}>🎟️ Промокод</b>
          <button className="btn btn-sm btn-gold" onClick={() => { setPromoOpen(true); }}>Ввести промокод</button>
        </div>
      </div>

      {/* Code history (§15.4) */}
      {game.codes.history.length > 0 ? (
        <div className="panel" style={{ marginTop: 10 }}>
          <div className="tiny" style={{ marginBottom: 4 }}>История введённых кодов:</div>
          {game.codes.history.slice(-6).reverse().map((h, i) => (
            <div key={i} className="tiny">{h.ok ? '✅' : '❌'} {h.code} · {new Date(h.at).toLocaleString('ru-RU')}</div>
          ))}
        </div>
      ) : null}

      {/* Dev tools */}
      {dev ? (
        <>
          <SectionTitle right={<span className="aura-chip">DEV-режим</span>}>Инструменты разработки</SectionTitle>
          <div className="panel col" style={{ gap: 8 }}>
            <div className="tiny">Среда: {tg ? 'Telegram WebView' : 'браузер (mock-режим)'} · админ-коды: разрешены (dev-режим)</div>
            <div className="row" style={{ gap: 6 }}>
              <button className={`btn btn-sm ${game.devFlags.fps ? 'btn-gold' : ''}`} onClick={() => { setDevFlag('fps', !game.devFlags.fps); }}>dev_fps: {game.devFlags.fps ? 'ON' : 'OFF'}</button>
              <button className={`btn btn-sm ${game.devFlags.hitboxes ? 'btn-gold' : ''}`} onClick={() => { setDevFlag('hitboxes', !game.devFlags.hitboxes); }}>dev_hitboxes: {game.devFlags.hitboxes ? 'ON' : 'OFF'}</button>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn btn-sm" onClick={() => { useGameStore.getState().devFastForward(3600); }}>⏩ +1 час (оффлайн)</button>
              <button className="btn btn-sm" onClick={() => { useGameStore.getState().devClearCache(); }} style={{ marginLeft: 'auto' }}>🧹 Очистить кеш</button>
            </div>
            <button className="btn btn-sm" onClick={() => { setLogOpen(true); }}>📜 Журнал событий (аналитика)</button>
            <div className="tiny">Сейв: localStorage «{SAVE_KEY}», версия {game.saveVersion}</div>
          </div>
        </>
      ) : null}

      <SectionTitle>Опасная зона</SectionTitle>
      <div className="panel col">
        {confirmReset ? (
          <>
            <div className="small">Точно сбросить ВЕСЬ прогресс? Это действие необратимо.</div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-sm" onClick={() => { setConfirmReset(false); }}>Отмена</button>
              <button className="btn btn-sm" style={{ background: 'var(--danger)', color: '#fff', border: 'none' }} onClick={() => { resetGame(); setConfirmReset(false); toast('Прогресс сброшен', 'info'); }}>
                Да, сбросить всё
              </button>
            </div>
          </>
        ) : (
          <button className="btn btn-wide" onClick={() => { setConfirmReset(true); }}>♻️ Сбросить прогресс</button>
        )}
      </div>

      {/* Version footer — long-press 3s opens the hidden code field (§15.1) */}
      <div
        className="long-press-target"
        style={{ marginTop: 24, textAlign: 'center', paddingBottom: 10 }}
        onPointerDown={startPress}
        onPointerUp={endPress}
        onPointerLeave={endPress}
        onContextMenu={(e) => { e.preventDefault(); }}
      >
        <div className="tiny">{GAME_NAME} · v1.0.0 (сборка 2)</div>
        <div className="tiny" style={{ opacity: 0.5 }}>удерживайте 3 секунды…</div>
      </div>

      {/* Promo input */}
      {(promoOpen || hiddenOpen) ? (
        <Modal title={hiddenOpen ? '🛠️ Служебный ввод' : '🎟️ Промокод'} onClose={checking ? undefined : () => { setPromoOpen(false); setHiddenOpen(false); setInput(''); }}>
          <div className="col">
            <input
              className="btn"
              style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 800, textAlign: 'center' }}
              placeholder={hiddenOpen ? 'код или dev_команда' : 'ВВЕДИТЕ КОД'}
              value={input}
              autoFocus
              disabled={checking}
              onChange={(e) => { setInput(e.target.value); }}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            />
            {checking ? (
              <div className="small muted" style={{ textAlign: 'center' }}>Проверяем код…</div>
            ) : (
              <button className="btn btn-cta btn-wide" disabled={input.trim().length === 0} onClick={submit}>Применить</button>
            )}
            <div className="tiny" style={{ textAlign: 'center' }}>
              {hiddenOpen
                ? 'Регистр не важен, пробелы обрезаются. Неверный код не блокирует игру.'
                : 'Официальные коды раздаются в каналах игры. Ограничение: 5 попыток в минуту.'}
            </div>
          </div>
        </Modal>
      ) : null}

      {/* Analytics log (dev) */}
      {logOpen ? (
        <Modal title="Журнал событий (последние 20)" onClose={() => { setLogOpen(false); }} wide>
          <div className="col" style={{ maxHeight: 320, overflowY: 'auto' }}>
            {recentEvents(20).slice().reverse().map((e, i) => (
              <div key={i} className="tiny" style={{ fontFamily: 'monospace' }}>
                {new Date(e.at).toLocaleTimeString('ru-RU')} · {e.name}{e.props ? ` ${JSON.stringify(e.props)}` : ''}
              </div>
            ))}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

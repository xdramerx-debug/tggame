import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { GAME_NAME, GAME_TAGLINE } from '../game/constants';
import { track } from '../platform/analytics';

/**
 * Boot screen (§1): logo, mood line, staged progress captions.
 * Safe zones respected (pads for Telegram cutouts / system panels).
 */
const STAGES = [
  'Пробуждение героев…',
  'Настройка врат…',
  'Подготовка наград…',
  'Настройка эха…',
];

export function BootScreen({ onDone }: { onDone: () => void }): ReactElement {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    track('boot_screen');
    const started = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - started;
      const next = Math.min(100, Math.round((elapsed / 1600) * 100)); // ~1.6s boot
      setPct(next);
      if (next >= 100) {
        window.clearInterval(timer);
        window.setTimeout(onDone, 220);
      }
    }, 80);
    return () => { window.clearInterval(timer); };
  }, [onDone]);

  const stageIdx = Math.min(STAGES.length - 1, Math.floor((pct / 100) * STAGES.length));

  return (
    <div className="boot-screen">
      <div className="boot-logo">🔮</div>
      <div className="title-lg" style={{ fontSize: 26, letterSpacing: '0.08em' }}>{GAME_NAME}</div>
      <div className="small muted" style={{ textAlign: 'center', maxWidth: 300 }}>{GAME_TAGLINE}</div>
      <div className="boot-bar">
        <div className="boot-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="small">{STAGES[stageIdx]}</div>
      <div className="tiny" style={{ position: 'absolute', bottom: 'calc(16px + var(--safe-bottom))' }}>
        Telegram Mini App · idle RPG · вертикальный экран, одна рука
      </div>
    </div>
  );
}

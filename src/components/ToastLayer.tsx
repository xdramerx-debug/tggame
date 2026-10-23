import type { ReactElement } from 'react';
import { useGameStore } from '../state/gameStore';

export function ToastLayer(): ReactElement {
  const toasts = useGameStore((s) => s.toasts);
  return (
    <div className="toast-layer">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>
      ))}
    </div>
  );
}

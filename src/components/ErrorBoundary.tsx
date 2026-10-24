import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { track } from '../platform/analytics';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * §13: приложение не должно превращаться в белый экран. При падении рендера
 * показываем понятную плашку с сохранением прогресса и перезапуском.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    track('render_error', { message: error.message, stack: (info.componentStack ?? '').slice(0, 400) });
  }

  override render(): ReactNode {
    if (this.state.error === null) return this.props.children;
    return (
      <div className="col" style={{ alignItems: 'center', justifyContent: 'center', height: '100dvh', gap: 14, padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 52 }}>🕯️</div>
        <div style={{ fontWeight: 800, fontSize: 17 }}>Эхо оборвалось…</div>
        <div className="muted small">Непредвиденная ошибка интерфейса. Прогресс сохранён — перезапустите игру, она продолжится с того же места.</div>
        <button className="btn primary" onClick={() => { window.location.reload(); }}>
          🔄 Перезапустить
        </button>
        <div className="tiny muted">{this.state.error.message.slice(0, 160)}</div>
      </div>
    );
  }
}

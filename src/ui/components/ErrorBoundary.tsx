import { Component } from 'react';
import type { ErrorInfo, ReactElement, ReactNode } from 'react';

interface Props {
  readonly children: ReactNode;
}

interface State {
  readonly error: Error | null;
}

/**
 * Last-resort boundary: a React crash must show a readable message instead of a
 * black WebView. Telemetry is out of scope (no backend), so the message is local.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[react] uncaught error', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="safe-pad flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-lg font-semibold text-blood">Что-то сломалось</h1>
        <p className="max-w-[44ch] text-sm text-[#9aa3ae]">{error.message}</p>
        <button
          type="button"
          className="hud-panel min-h-[48px] px-5 text-sm text-gold"
          onClick={() => window.location.reload()}
        >
          Перезапустить
        </button>
      </div>
    ) as ReactElement;
  }
}

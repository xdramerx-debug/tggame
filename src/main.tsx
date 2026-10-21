import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import { App } from './App';
import { ErrorBoundary } from './ui/components/ErrorBoundary';
import { initTelegram } from './telegram/init';
import { applyThemeToDocument } from './telegram/theme';
import { applySafeAreaInsets, disableVerticalSwipes } from './telegram/viewport';

/**
 * Entry point.
 *
 * Everything that must exist before the first paint is executed synchronously
 * here (theme variables, safe-area insets, gesture guards, Telegram bootstrap)
 * so React's first render already has correct CSS variables.
 */
function bootstrap(): void {
  // Telegram SDK failures must never prevent the game from starting: every
  // wrapper degrades to a no-op outside a supported client.
  try {
    initTelegram();
  } catch (error) {
    console.warn('[boot] Telegram init skipped', error);
  }
  applyThemeToDocument();
  applySafeAreaInsets();
  disableVerticalSwipes();

  // The inline splash in index.html is replaced by the React splash.
  document.getElementById('boot')?.remove();

  const container = document.getElementById('root');
  if (!container) throw new Error('#root is missing from index.html');

  createRoot(container).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}

bootstrap();

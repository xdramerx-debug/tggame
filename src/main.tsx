import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initTelegram } from './platform/telegram';
import { initAudio } from './platform/audio';
import './styles.css';

initTelegram();

// Звук не запускается до первого тапа (§8): первый тап — инициализация аудио
const unlockAudio = (): void => {
  initAudio();
  window.removeEventListener('pointerdown', unlockAudio);
  window.removeEventListener('keydown', unlockAudio);
};
window.addEventListener('pointerdown', unlockAudio, { once: false });
window.addEventListener('keydown', unlockAudio, { once: false });

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

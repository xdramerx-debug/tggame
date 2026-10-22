import { audio } from '@/game/audio';

/** Reasons the game loop is stopped. Kept for diagnostics and autosave policy. */
export type PauseReason = 'hidden' | 'blur' | 'pagehide' | 'freeze' | 'manual';

export interface LifecycleHandlers {
  /** Called once per pause transition; must be fast and synchronous. */
  readonly onPause: (reason: PauseReason) => void;
  /** Called when the app becomes interactive again. */
  readonly onResume: () => void;
}

/**
 * Mobile lifecycle wiring.
 *
 * - `visibilitychange` → pause (autosave happens in the same tick).
 * - `window.blur` → pause: iOS fires it when Telegram opens an overlay.
 * - `pagehide` / `freeze` → pause without expecting a resume.
 * - `focus` / `pageshow` / `resume` → resume, but never while hidden.
 */
export function installLifecycle(handlers: LifecycleHandlers): () => void {
  let paused = false;

  const pause = (reason: PauseReason): void => {
    if (paused) return;
    paused = true;
    // Audio must die with the loop: Telegram WebView keeps playing otherwise.
    audio.suspend();
    handlers.onPause(reason);
  };

  const resume = (): void => {
    if (!paused) return;
    if (document.visibilityState === 'hidden') return;
    paused = false;
    audio.resume();
    handlers.onResume();
  };

  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') pause('hidden');
    else resume();
  };
  const onBlur = (): void => pause('blur');
  const onFocus = (): void => resume();
  const onPageHide = (): void => pause('pagehide');
  const onPageShow = (): void => resume();
  const onFreeze = (): void => pause('freeze');

  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('freeze', onFreeze);
  window.addEventListener('blur', onBlur);
  window.addEventListener('focus', onFocus);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);

  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('freeze', onFreeze);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
  };
}

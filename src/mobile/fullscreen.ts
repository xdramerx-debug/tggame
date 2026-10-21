/**
 * Fullscreen helpers. Telegram Bot API 8.0 fullscreen is preferred; the DOM
 * API is the fallback for Android Chrome (iOS Safari supports neither for
 * arbitrary elements, so the game simply stays in the WebView viewport).
 */
export function isDomFullscreen(): boolean {
  return typeof document !== 'undefined' && document.fullscreenElement !== null;
}

export async function enterDomFullscreen(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  if (document.fullscreenElement) return true;
  const element = document.documentElement;
  const request = element.requestFullscreen?.bind(element);
  if (!request) return false;
  try {
    await request({ navigationUI: 'hide' });
    return true;
  } catch {
    return false;
  }
}

export async function exitDomFullscreen(): Promise<boolean> {
  if (typeof document === 'undefined' || !document.fullscreenElement) return false;
  try {
    await document.exitFullscreen();
    return true;
  } catch {
    return false;
  }
}

/** Re-applies landscape lock after entering fullscreen (Android drops it on exit). */
export function watchFullscreen(onChange: (active: boolean) => void): () => void {
  const handler = (): void => onChange(Boolean(document.fullscreenElement));
  document.addEventListener('fullscreenchange', handler);
  return () => document.removeEventListener('fullscreenchange', handler);
}

import {
  closingBehavior,
  swipeBehavior,
  viewport,
} from '@telegram-apps/sdk';
import {
  applyInsets,
  combineInsets,
  readCssEnvInsets,
  type SafeInsets,
} from '@/mobile/safeArea';

function safely<T>(action: () => T): T | null {
  try {
    return action();
  } catch (error) {
    console.warn('[telegram] viewport call failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Resolves the effective safe-area insets: Telegram-reported insets plus the
 * device notches read from CSS `env()`. The larger value wins on every side.
 */
export function resolveSafeInsets(): SafeInsets {
  const css = readCssEnvInsets();
  const tg = safely(() => viewport.safeAreaInsets());
  const content = safely(() => viewport.contentSafeAreaInsets());
  return combineInsets(css, tg, content);
}

/** Publishes safe-area insets as CSS variables for HUD components. */
export function applySafeAreaInsets(): SafeInsets {
  const insets = resolveSafeInsets();
  applyInsets(insets);
  return insets;
}

/** Keeps safe-area variables in sync while the client header/insets change. */
export function watchSafeArea(onChange?: (insets: SafeInsets) => void): () => void {
  const update = (): void => {
    onChange?.(applySafeAreaInsets());
  };
  update();
  const removers: (() => void)[] = [];
  safely(() => {
    if (viewport.safeAreaInsets.sub && viewport.isMounted()) {
      removers.push(viewport.safeAreaInsets.sub(update));
    }
  });
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
  return () => {
    for (const remove of removers) remove();
    window.removeEventListener('resize', update);
    window.removeEventListener('orientationchange', update);
  };
}

/**
 * Requests immersive fullscreen: Telegram Bot API 8.0 fullscreen first, then the
 * browser API (Android Chrome) as a fallback. iOS Safari has no element
 * fullscreen, so failure is expected and harmless there.
 */
export async function requestImmersiveFullscreen(): Promise<boolean> {
  const tgRequest = safely(() => viewport.requestFullscreen);
  if (tgRequest?.isAvailable?.()) {
    const ok = await tgRequest().then(
      () => true,
      () => false,
    );
    if (ok) return true;
  }
  if (document.fullscreenElement) return true;
  const element = document.documentElement;
  if (element.requestFullscreen) {
    return element.requestFullscreen({ navigationUI: 'hide' }).then(
      () => true,
      () => false,
    );
  }
  return false;
}

/** Stops vertical swipes from minimising/closing the Mini App (Bot API 7.7+). */
export function disableVerticalSwipes(): void {
  safely(() => {
    if (swipeBehavior.mount.isAvailable?.()) swipeBehavior.mount();
    if (swipeBehavior.disableVertical.isAvailable?.()) swipeBehavior.disableVertical();
  });
}

/** Asks for a confirmation dialog when the user closes the app mid-run. */
export function setCloseConfirmation(enabled: boolean): void {
  safely(() => {
    if (!closingBehavior.isMounted() && closingBehavior.mount.isAvailable()) closingBehavior.mount();
    if (enabled) closingBehavior.enableConfirmation();
    else closingBehavior.disableConfirmation();
  });
}

/** Expands the Mini App to the full available height. */
export function expandViewport(): void {
  safely(() => viewport.expand());
}

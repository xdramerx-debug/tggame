import { postEvent } from '@telegram-apps/sdk';

export type ScreenOrientationKind = 'landscape' | 'portrait';

export interface OrientationSnapshot {
  readonly kind: ScreenOrientationKind;
  /** True when Telegram or the browser confirmed an orientation lock. */
  readonly locked: boolean;
  /** 0..1 progress hint for the rotate overlay (based on viewport aspect). */
  readonly aspect: number;
}

function currentKind(): ScreenOrientationKind {
  if (typeof window === 'undefined') return 'landscape';
  const width = window.innerWidth;
  const height = window.innerHeight;
  return width >= height ? 'landscape' : 'portrait';
}

export function isLandscape(): boolean {
  return currentKind() === 'landscape';
}

export function isPortrait(): boolean {
  return currentKind() === 'portrait';
}

/**
 * Tries to lock the Mini App to landscape.
 *
 * Order matters: Telegram's `web_app_toggle_orientation_lock` locks the *current*
 * mode, so it is only sent while the device already reports landscape. On
 * Android we additionally ask the Screen Orientation API for `landscape`
 * (works in fullscreen; rejected on iOS, which is expected and handled).
 *
 * @returns true when at least one lock mechanism was accepted
 */
export async function lockLandscape(): Promise<boolean> {
  let locked = false;

  const orientation = window.screen?.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  if (typeof orientation?.lock === 'function') {
    try {
      await orientation.lock('landscape');
      locked = true;
    } catch {
      // iOS Safari and non-fullscreen Android both reject; fall through.
    }
  }

  if (isLandscape()) {
    try {
      postEvent('web_app_toggle_orientation_lock', { locked: true });
      locked = true;
    } catch {
      // Outside Telegram the bridge is not available.
    }
  }
  return locked;
}

/** Releases the Telegram orientation lock (e.g. before sharing a result). */
export function unlockOrientation(): void {
  try {
    postEvent('web_app_toggle_orientation_lock', { locked: false });
  } catch {
    /* not in Telegram */
  }
}

/** Subscribes to orientation/viewport changes with rAF coalescing. */
export function watchOrientation(onChange: (snapshot: OrientationSnapshot) => void): () => void {
  let frame = 0;
  let locked = false;

  const emit = (): void => {
    frame = 0;
    const kind = currentKind();
    const aspect = window.innerHeight > 0 ? window.innerWidth / window.innerHeight : 1;
    onChange({ kind, locked, aspect });
  };
  const schedule = (): void => {
    if (frame !== 0) return;
    frame = requestAnimationFrame(emit);
  };

  const onVisibility = (): void => {
    // Re-assert the lock when returning from the background (iOS drops it).
    if (document.visibilityState === 'visible' && isLandscape()) {
      void lockLandscape().then((ok) => {
        locked = ok || locked;
        schedule();
      });
    }
  };

  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  window.screen?.orientation?.addEventListener?.('change', schedule);
  document.addEventListener('visibilitychange', onVisibility);
  emit();

  return () => {
    if (frame !== 0) cancelAnimationFrame(frame);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('orientationchange', schedule);
    window.screen?.orientation?.removeEventListener?.('change', schedule);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

/**
 * Screen Wake Lock: a 60-second round must not end because the phone dimmed.
 *
 * The browser drops the lock whenever the page is hidden, so it is re-requested
 * on every visibility change. Everything degrades to a no-op when unsupported.
 */

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: 'release', listener: () => void) => void;
}

interface WakeLockNavigator {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
}

let sentinel: WakeLockSentinelLike | null = null;
let wanted = false;

async function acquire(): Promise<void> {
  if (!wanted || document.visibilityState !== 'visible') return;
  const api = (navigator as unknown as WakeLockNavigator).wakeLock;
  if (api === undefined) return;
  try {
    sentinel = await api.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = null;
    });
  } catch {
    sentinel = null;
  }
}

async function release(): Promise<void> {
  const current = sentinel;
  sentinel = null;
  if (!current || current.released) return;
  try {
    await current.release();
  } catch {
    // Already gone.
  }
}

function onVisibility(): void {
  if (document.visibilityState === 'visible') void acquire();
  else void release();
}

export function keepScreenAwake(): void {
  if (wanted) return;
  wanted = true;
  document.addEventListener('visibilitychange', onVisibility);
  void acquire();
}

export function allowScreenSleep(): void {
  if (!wanted) return;
  wanted = false;
  document.removeEventListener('visibilitychange', onVisibility);
  void release();
}

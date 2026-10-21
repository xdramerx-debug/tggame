interface WakeLockSentinelLike extends EventTarget {
  released: boolean;
  release(): Promise<void>;
}

interface WakeLockApi {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

type NavigatorWithWakeLock = Navigator & { wakeLock?: WakeLockApi };

/**
 * Screen Wake Lock keeper.
 *
 * The lock is automatically dropped by the browser when the page is hidden, so
 * it is re-acquired on `visibilitychange`. Failures are non-fatal: iOS < 16.4
 * has no Wake Lock API and the game still runs, the screen just dims.
 */
export class WakeLockKeeper {
  private sentinel: WakeLockSentinelLike | null = null;
  private enabled = true;
  private cleanup: (() => void) | null = null;
  private acquiring = false;

  get isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'wakeLock' in (navigator as NavigatorWithWakeLock);
  }

  get isHeld(): boolean {
    return this.sentinel !== null && !this.sentinel.released;
  }

  /** Starts holding a screen lock and keeps re-acquiring it while visible. */
  start(): void {
    if (!this.enabled || this.cleanup) return;
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') void this.acquire();
    };
    document.addEventListener('visibilitychange', onVisibility);
    this.cleanup = () => document.removeEventListener('visibilitychange', onVisibility);
    void this.acquire();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) void this.release();
    else if (this.cleanup) void this.acquire();
  }

  /** Idempotent acquire; safe to call on every resume. */
  async acquire(): Promise<boolean> {
    if (!this.enabled || this.acquiring) return this.isHeld;
    if (this.isHeld) return true;
    const api = (navigator as NavigatorWithWakeLock).wakeLock;
    if (!api) return false;
    this.acquiring = true;
    try {
      this.sentinel = await api.request('screen');
      this.sentinel.addEventListener('release', () => {
        this.sentinel = null;
      });
      return true;
    } catch {
      return false;
    } finally {
      this.acquiring = false;
    }
  }

  async release(): Promise<void> {
    const sentinel = this.sentinel;
    this.sentinel = null;
    if (!sentinel) return;
    try {
      await sentinel.release();
    } catch {
      /* already released */
    }
  }

  /** Stops the keeper entirely and releases the lock. */
  async dispose(): Promise<void> {
    this.cleanup?.();
    this.cleanup = null;
    this.enabled = false;
    await this.release();
  }
}

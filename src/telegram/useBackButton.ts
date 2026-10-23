import { useEffect } from 'react';
import { backButton } from '@telegram-apps/sdk';

/**
 * Binds the Telegram back button to `onBack` while the component is mounted.
 *
 * The native back arrow is the only way out of a Mini App overlay on iOS, and
 * users press it *before* looking for a close button, so every modal/sheet binds
 * it. The hook always removes its listener and hides the button on unmount: a
 * leaked handler on a sheet that no longer exists is a dead end for the player
 * (the arrow does nothing, and the app looks frozen).
 *
 * Outside Telegram the calls are no-ops — the SDK throws, and we swallow it.
 */
export function useBackButton(onBack: (() => void) | null): void {
  useEffect(() => {
    if (!onBack) return;
    let attached = false;
    try {
      if (!backButton.isMounted()) backButton.mount();
      backButton.show();
      backButton.onClick(onBack);
      attached = true;
    } catch (error) {
      console.warn('[telegram] back button unavailable', error instanceof Error ? error.message : error);
    }
    return () => {
      if (!attached) return;
      try {
        backButton.offClick(onBack);
        backButton.hide();
      } catch {
        // Unmounting during client teardown: nothing useful to do here.
      }
    };
  }, [onBack]);
}

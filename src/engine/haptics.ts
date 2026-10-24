/** Guarded vibration — desktop/iOS Safari simply no-ops. */

interface Vibrator {
  vibrate?: (pattern: number | number[]) => boolean;
}

export function buzz(pattern: number | number[]): void {
  const nav = navigator as unknown as Vibrator | undefined;
  if (!nav) return;
  try {
    nav.vibrate?.(pattern);
  } catch {
    // some WebViews throw on unsupported patterns
  }
}

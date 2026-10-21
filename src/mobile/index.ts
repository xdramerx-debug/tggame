/**
 * Mobile platform layer: everything that is about the device rather than the game.
 * Import from here in UI code to keep platform quirks in one place.
 */
export { installGestureGuards, makeTapFriendly } from './gestures';
export { installLifecycle, type LifecycleHandlers, type PauseReason } from './lifecycle';
export { isLandscape, isPortrait, lockLandscape, unlockOrientation, watchOrientation } from './orientation';
export { applyInsets, combineInsets, readCssEnvInsets, ZERO_INSETS, type SafeInsets } from './safeArea';
export { enterDomFullscreen, exitDomFullscreen, isDomFullscreen, watchFullscreen } from './fullscreen';
export { WakeLockKeeper } from './wakeLock';

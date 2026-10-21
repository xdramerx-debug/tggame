/**
 * Global gesture guards.
 *
 * Everything here exists because a WebView happily interprets unprompted
 * gestures as navigation: long-press context menus, double-tap zoom, pinch
 * page zoom, pull-to-refresh. Gameplay uses PointerEvents only, so the browser
 * must never see a "native" gesture.
 */

const SCROLLABLE_SELECTOR = '[data-scrollable="true"]';

function isScrollableTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(SCROLLABLE_SELECTOR) !== null;
}

/** Installs the guards; returns a cleanup that removes every listener. */
export function installGestureGuards(doc: Document = document): () => void {
  const block = (event: Event): void => {
    event.preventDefault();
  };

  const onTouchMove = (event: TouchEvent): void => {
    // Allow intentional scrolling inside inventory lists only.
    if (!isScrollableTarget(event.target)) event.preventDefault();
  };

  const onTouchStart = (event: TouchEvent): void => {
    // Two-finger page zoom: the game consumes pinch itself on the canvas.
    if (event.touches.length > 1) event.preventDefault();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    // Keyboards are not part of the control scheme; block browser zoom helpers.
    if ((event.ctrlKey || event.metaKey) && ['+', '-', '=', '0'].includes(event.key)) {
      event.preventDefault();
    }
  };

  const listeners: [EventTarget, string, EventListener, AddEventListenerOptions][] = [
    [doc, 'contextmenu', block, { capture: true }],
    [doc, 'gesturestart', block, { capture: true, passive: false }],
    [doc, 'gesturechange', block, { capture: true, passive: false }],
    [doc, 'gestureend', block, { capture: true, passive: false }],
    [doc, 'dblclick', block, { capture: true }],
    [doc, 'dragstart', block, { capture: true }],
    [doc, 'selectstart', block, { capture: true }],
    [doc, 'touchmove', onTouchMove as EventListener, { capture: true, passive: false }],
    [doc, 'touchstart', onTouchStart as EventListener, { capture: true, passive: false }],
    [doc, 'keydown', onKeyDown as EventListener, { capture: true }],
  ];

  for (const [target, type, handler, options] of listeners) {
    target.addEventListener(type, handler, options);
  }

  // Safari-specific: prevents the rubber-band scroll of the document element.
  const previousOverscroll = doc.documentElement.style.overscrollBehavior;
  const previousBodyOverscroll = doc.body.style.overscrollBehavior;
  doc.documentElement.style.overscrollBehavior = 'none';
  doc.body.style.overscrollBehavior = 'none';

  return () => {
    for (const [target, type, handler, options] of listeners) {
      target.removeEventListener(type, handler, options);
    }
    doc.documentElement.style.overscrollBehavior = previousOverscroll;
    doc.body.style.overscrollBehavior = previousBodyOverscroll;
  };
}

/**
 * Prevents the "double tap to zoom" delay on interactive elements by making the
 * hit area's touch-action manipulation. CSS already covers most cases; this
 * helper is used by dynamically created buttons.
 */
export function makeTapFriendly(element: HTMLElement): void {
  element.style.touchAction = 'manipulation';
  element.style.setProperty('-webkit-tap-highlight-color', 'transparent');
}

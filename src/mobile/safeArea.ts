/** Insets in CSS pixels from each screen edge. */
export interface SafeInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export const ZERO_INSETS: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/** Reads `env(safe-area-inset-*)` from a hidden probe element. */
export function readCssEnvInsets(doc: Document = document): SafeInsets {
  if (typeof document === 'undefined') return ZERO_INSETS;
  const probe = doc.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;' +
    'padding-top:env(safe-area-inset-top,0px);padding-right:env(safe-area-inset-right,0px);' +
    'padding-bottom:env(safe-area-inset-bottom,0px);padding-left:env(safe-area-inset-left,0px)';
  doc.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const read = (property: string): number => Number.parseFloat(style.getPropertyValue(property)) || 0;
  const insets: SafeInsets = {
    top: read('padding-top'),
    right: read('padding-right'),
    bottom: read('padding-bottom'),
    left: read('padding-left'),
  };
  probe.remove();
  return insets;
}

const sanitize = (value: number | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;

/** Element-wise maximum of several inset sets (largest wins). */
export function combineInsets(...insets: (Partial<SafeInsets> | null | undefined)[]): SafeInsets {
  return insets.reduce<SafeInsets>(
    (acc, next) => ({
      top: Math.max(acc.top, sanitize(next?.top)),
      right: Math.max(acc.right, sanitize(next?.right)),
      bottom: Math.max(acc.bottom, sanitize(next?.bottom)),
      left: Math.max(acc.left, sanitize(next?.left)),
    }),
    ZERO_INSETS,
  );
}

/** Publishes insets as `--safe-*` CSS variables consumed by every HUD screen. */
export function applyInsets(insets: SafeInsets, root: HTMLElement = document.documentElement): void {
  root.style.setProperty('--safe-top', `${Math.round(insets.top)}px`);
  root.style.setProperty('--safe-right', `${Math.round(insets.right)}px`);
  root.style.setProperty('--safe-bottom', `${Math.round(insets.bottom)}px`);
  root.style.setProperty('--safe-left', `${Math.round(insets.left)}px`);
}

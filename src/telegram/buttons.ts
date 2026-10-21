import { backButton, mainButton } from '@telegram-apps/sdk';

const noop = (): void => undefined;

function safely(action: () => void): void {
  try {
    action();
  } catch (error) {
    console.warn('[telegram] UI call failed:', error instanceof Error ? error.message : error);
  }
}

export interface MainButtonOptions {
  readonly text: string;
  /** Hex colour, e.g. `#C9A227` (Telegram requires the #RRGGBB form). */
  readonly color?: `#${string}`;
  readonly textColor?: `#${string}`;
  readonly enabled?: boolean;
  readonly onClick: () => void;
}

/**
 * Shows the Telegram MainButton with a single action.
 * @returns cleanup that hides the button and removes the listener
 */
export function showMainButton(options: MainButtonOptions): () => void {
  let attached = false;
  safely(() => {
    mainButton.setParams({
      text: options.text,
      isVisible: true,
      isEnabled: options.enabled ?? true,
      ...(options.color ? { backgroundColor: options.color } : {}),
      ...(options.textColor ? { textColor: options.textColor } : {}),
    });
    mainButton.onClick(options.onClick);
    attached = true;
  });
  return () => {
    if (!attached) return;
    safely(() => {
      mainButton.offClick(options.onClick);
      mainButton.setParams({ isVisible: false });
    });
  };
}

/** Updates MainButton text/label without re-registering the handler. */
export function setMainButtonLabel(text: string, enabled = true): void {
  safely(() => mainButton.setParams({ text, isEnabled: enabled }));
}

export function setMainButtonLoading(loading: boolean): void {
  safely(() => mainButton.setParams({ isLoaderVisible: loading }));
}

export function hideMainButton(): void {
  safely(() => mainButton.setParams({ isVisible: false }));
}

/**
 * Shows the Telegram BackButton.
 * @returns cleanup that hides the button and detaches the listener
 */
export function showBackButton(onClick: () => void): () => void {
  let attached = false;
  safely(() => {
    backButton.show();
    backButton.onClick(onClick);
    attached = true;
  });
  return () => {
    if (!attached) return;
    safely(() => {
      backButton.offClick(onClick);
      backButton.hide();
    });
  };
}

/** Hides the BackButton (required on the main menu). */
export function hideBackButton(): void {
  safely(() => backButton.hide());
}

/** Fallback used by React when the SDK is unavailable: no-op unsubscribe. */
export const hiddenButtonCleanup = noop;

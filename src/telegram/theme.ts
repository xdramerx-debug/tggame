import { themeParams } from '@telegram-apps/sdk';

/** Colours the game UI consumes, resolved from Telegram or our fallback palette. */
export interface ThemeSnapshot {
  readonly isDark: boolean;
  readonly background: string;
  readonly secondaryBackground: string;
  readonly text: string;
  readonly hint: string;
  readonly accent: string;
  readonly accentText: string;
  readonly link: string;
  readonly danger: string;
}

/** Spec palette — used outside Telegram and whenever a theme key is missing. */
export const FALLBACK_THEME: ThemeSnapshot = {
  isDark: true,
  background: '#0B0E14',
  secondaryBackground: '#1E2A3A',
  text: '#E8E3D6',
  hint: '#9AA3AE',
  accent: '#C9A227',
  accentText: '#0B0E14',
  link: '#4A7C8C',
  danger: '#B33A3A',
};

const HEX = /^#[0-9a-f]{6}$/i;

function pick(value: string | undefined, fallback: string): string {
  return value && HEX.test(value) ? value : fallback;
}

/** Reads the current Telegram theme (falls back to the spec palette off-client). */
export function readTheme(): ThemeSnapshot {
  let state: Partial<Record<string, `#${string}`>> = {};
  try {
    state = themeParams.state();
  } catch {
    state = {};
  }
  const background = pick(state['bg_color'], FALLBACK_THEME.background);
  return {
    isDark: isHexDark(background),
    background,
    secondaryBackground: pick(state['secondary_bg_color'], FALLBACK_THEME.secondaryBackground),
    text: pick(state['text_color'], FALLBACK_THEME.text),
    hint: pick(state['hint_color'], FALLBACK_THEME.hint),
    accent: pick(state['button_color'], FALLBACK_THEME.accent),
    accentText: pick(state['button_text_color'], FALLBACK_THEME.accentText),
    link: pick(state['link_color'], FALLBACK_THEME.link),
    danger: pick(state['destructive_text_color'], FALLBACK_THEME.danger),
  };
}

/** Relative luminance test; keeps UI readable if a user picks a light Telegram theme. */
export function isHexDark(hex: string): boolean {
  const clean = hex.replace('#', '');
  const r = Number.parseInt(clean.slice(0, 2), 16) / 255;
  const g = Number.parseInt(clean.slice(2, 4), 16) / 255;
  const b = Number.parseInt(clean.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 0.42;
}

/**
 * Writes theme values into CSS variables consumed by the HUD.
 * The 3D scene always stays dark; only UI chrome adapts to the user's theme.
 */
export function applyThemeToDocument(theme: ThemeSnapshot = readTheme()): void {
  const root = document.documentElement;
  root.style.setProperty('--tg-bg', theme.background);
  root.style.setProperty('--tg-bg-secondary', theme.secondaryBackground);
  root.style.setProperty('--tg-text', theme.text);
  root.style.setProperty('--tg-hint', theme.hint);
  root.style.setProperty('--tg-accent', theme.accent);
  root.style.setProperty('--tg-accent-text', theme.accentText);
  root.style.setProperty('--tg-link', theme.link);
  root.style.setProperty('--tg-danger', theme.danger);
  // Panels remain dark in light Telegram themes: readability on sunlight wins.
  root.style.setProperty('--c-panel', 'rgba(0, 0, 0, 0.6)');
  root.dataset['theme'] = theme.isDark ? 'dark' : 'light';
}

/**
 * Subscribes to Telegram theme changes.
 * @returns unsubscribe function (safe to call when the SDK is not mounted)
 */
export function watchTheme(onChange: (theme: ThemeSnapshot) => void): () => void {
  applyThemeToDocument();
  try {
    const sub = themeParams.state.sub(() => {
      const theme = readTheme();
      applyThemeToDocument(theme);
      onChange(theme);
    });
    return sub;
  } catch {
    return () => undefined;
  }
}

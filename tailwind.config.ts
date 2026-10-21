import type { Config } from 'tailwindcss';

/**
 * Design tokens are mirrored as CSS variables in `src/styles/index.css`
 * so both Tailwind classes and raw shader/DOM code share one palette.
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        void: '#0B0E14',
        slate: '#1E2A3A',
        gold: '#C9A227',
        blood: '#B33A3A',
        frost: '#4A7C8C',
        bark: '#6B4E2E',
      },
      fontFamily: {
        display: ['"Cinzel"', 'Georgia', 'serif'],
        sans: ['system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
      },
      borderRadius: {
        hud: '14px',
      },
      boxShadow: {
        hud: '0 0 0 2px rgba(0,0,0,0.85), 0 6px 24px rgba(0,0,0,0.55)',
      },
      screens: {
        // Landscape phone breakpoints; the game never targets portrait layouts.
        short: { raw: '(max-height: 430px)' },
      },
    },
  },
  corePlugins: {
    // Hover styles are meaningless on touch-only targets and cost bytes.
    preflight: true,
  },
  plugins: [],
};

export default config;

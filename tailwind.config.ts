import type { Config } from 'tailwindcss';

/** Design tokens: one place for the palette the HUD, menus and 3D stage share. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#08060a',
        char: '#141018',
        rust: '#8d2f1f',
        blood: '#c1372a',
        bone: '#e8ddc8',
        acid: '#b6e04a',
        ember: '#f0a13a',
      },
      fontFamily: {
        display: ['"Arial Black"', 'Impact', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;

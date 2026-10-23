import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        abyss: '#060913',
        obsidian: '#0d1326',
        panel: '#131b35',
        panelLight: '#1b2649',
        gold: '#f6c453',
        amber: '#ff9233',
        crimson: '#ff4757',
        frost: '#38bdf8',
        sylvan: '#34d399',
        astral: '#c084fc',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      keyframes: {
        floatSlow: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-120%)' },
          '100%': { transform: 'translateX(120%)' },
        },
        spinSlow: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        spinReverse: {
          '0%': { transform: 'rotate(360deg)' },
          '100%': { transform: 'rotate(0deg)' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '0.55', transform: 'scale(0.97)' },
          '50%': { opacity: '1', transform: 'scale(1.04)' },
        },
      },
      animation: {
        'float-slow': 'floatSlow 3.2s ease-in-out infinite',
        shimmer: 'shimmer 2.4s ease-in-out infinite',
        'spin-slow': 'spinSlow 18s linear infinite',
        'spin-reverse': 'spinReverse 24s linear infinite',
        'pulse-glow': 'pulseGlow 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;

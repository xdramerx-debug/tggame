import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * FREAKPIT build config.
 *
 * - `target: es2020` matches the browserslist baseline (iOS 15+, Chrome Android 100+).
 * - `base: './'` keeps relative URLs working inside the Telegram WebView and on
 *   GitHub Pages served from a sub-path.
 * - `allowedHosts: true` is required by the sandbox preview proxy and by the
 *   Telegram WebView host; there is no meaningful host allowlist on mobile.
 */
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2020',
    cssTarget: 'chrome100',
    sourcemap: false,
    assetsInlineLimit: 2048,
    rollupOptions: {
      output: {
        manualChunks(id: string): string | undefined {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/react')) return 'react';
          if (id.includes('@telegram-apps')) return 'telegram';
          return undefined;
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
});

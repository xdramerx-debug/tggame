import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    reporters: ['default'],
    coverage: {
      reporter: ['text', 'lcov'],
      include: ['src/game/core/**', 'src/game/visual/textures/**', 'src/mobile/safeArea.ts', 'src/db/**'],
      thresholds: {
        // Pure-function modules must stay well covered; UI/engine glue is E2E-tested.
        lines: 60,
        functions: 60,
      },
    },
  },
});

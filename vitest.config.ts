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
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    reporters: ['default'],
    coverage: {
      reporter: ['text', 'lcov'],
      include: ['src/game/**'],
      thresholds: {
        lines: 70,
        functions: 70,
      },
    },
  },
});

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
      include: ['src/fight/**', 'src/characters/**'],
      thresholds: {
        // The simulation is pure and must stay covered; rendering is E2E-tested.
        lines: 70,
        functions: 70,
      },
    },
  },
});

import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts: vitest 3 bundles rollup-based Vite types,
// which clash with Vite 8 (rolldown) plugin types. Unit tests are pure Node —
// no plugins needed here.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
    environment: 'node',
  },
});

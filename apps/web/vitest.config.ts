import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Written fresh rather than extended from `vite.config.ts`: that config's `tanstackRouter` plugin
 * regenerates `routeTree.gen.ts`, which has no business happening on every test run.
 *
 * `jsdom` for every file, rather than per-file docblocks — a test that quietly runs in the wrong
 * environment fails in ways that have nothing to do with what it is testing.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'jsdom',
    // Pinned, because dates are formatted for reading in local time: a machine west of UTC renders a
    // `Z` timestamp on the previous day, and the assertion that catches a month-first bug fails there.
    env: { TZ: 'UTC' },
    include: ['src/**/*.test.{ts,tsx}'],
    name: 'web',
    setupFiles: ['./vitest.setup.ts'],
  },
});

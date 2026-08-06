import { defineConfig } from 'vitest/config';

/**
 * The unit suite. Playwright (`pnpm test:e2e`, apps/e2e) remains the default test layer and covers
 * anything reachable through the running app; this one covers what it can't reach. See the
 * `unit-testing` skill for where that line sits.
 *
 * Deliberately not a turbo task — one root command, nothing worth caching, and vitest owns its own
 * watch mode. `--project server` / `--project web` narrows a run.
 */
export default defineConfig({
  test: {
    projects: ['apps/server/vitest.config.ts', 'apps/web/vitest.config.ts'],
  },
});

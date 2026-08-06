import { defineConfig } from 'vitest/config';

import { UNIT_DATABASE_URL } from './vitest.global-setup';

export default defineConfig({
  test: {
    /**
     * `#config/env` validates the whole environment on import and calls `process.exit(1)` when it
     * doesn't parse — which vitest can only report as a worker that died, not as a failure anyone
     * can read. Every var it demands is therefore set here, before the module graph loads.
     *
     * The three credentials are deliberately nonsense: every external service is mocked, so a real
     * key would only mean a test run could reach one. DATABASE_URL is the exception — that one
     * points at a real database, and `vitest.setup.ts` checks which.
     */
    env: {
      BETTER_AUTH_SECRET: 'unit-test-secret',
      DATABASE_URL: UNIT_DATABASE_URL,
      HOMEWISE_ABLY_API_KEY: 'unit.test:key',
      HOMEWISE_RESEND_API_KEY: 'unit-test-resend-key',
      NODE_ENV: 'test',
    },
    globalSetup: './vitest.global-setup.ts',
    include: ['src/**/*.test.ts'],
    name: 'server',
    setupFiles: ['./vitest.setup.ts'],
  },
});

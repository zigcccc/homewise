import path from 'node:path';

import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

import { STORAGE_STATE } from './support/paths';

// Optional, git-ignored local overrides (e.g. a custom TEST_DATABASE_URL). CI
// supplies everything it needs via workflow env, so this file is not required.
loadEnv({ path: path.resolve(import.meta.dirname, '.env.test') });

// The suite always runs the whole app locally — on a dev machine and on CI alike
// (see .github/workflows/ci.yml). globalSetup stands up an isolated test Postgres
// and seeds it; webServer boots the server + the web app served as a production
// build. There is no "run against a deployed preview" mode.
const WEB_URL = 'http://localhost:3000';
// Only used for the local webServer readiness probe + the web's VITE_API_URL.
const API_URL = 'http://localhost:5173';
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://user:password@localhost:8766/homewise_test';

export default defineConfig({
  testDir: './tests',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Worker count is a server-capacity knob, not a correctness one — spec isolation
  // (the project phases below + round-tripped mutators) holds at any count. We serve
  // the production build (see webServer), which handles this concurrency; both are
  // capped modestly to match the machine's headroom.
  workers: process.env.CI ? 2 : 3,
  // Generous timeouts so a slow-but-correct action under load completes rather than
  // flaking (server latency, not the assertion, is what varies).
  timeout: 45_000,
  expect: { timeout: 12_000 },
  reporter: [['html', { open: 'never' }], ['list']],
  globalSetup: './support/global-setup.ts',
  globalTeardown: './support/global-teardown.ts',
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  // Three phases run in order (setup → parallel → exclusive), sequenced by
  // `dependencies`. The bulk of the suite parallelizes; the few specs that mutate
  // a shared seed row are quarantined into a single-file `exclusive` phase that
  // runs alone at the end, so they never overlap owner-dependent or
  // name-asserting specs (nor each other).
  projects: [
    // Logs the seeded users in once and saves their sessions; every other project
    // reuses them via storageState, so tests don't re-authenticate.
    { name: 'setup', testMatch: /auth\.setup\.ts$/ },
    {
      name: 'parallel',
      testIgnore: [/auth\.setup\.ts$/, /serial-seed-mutations\.spec\.ts$/],
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE },
      dependencies: ['setup'],
      // Every spec here uses unique data, so tests can run fully concurrently.
      fullyParallel: true,
    },
    {
      // Shared-seed mutators (household name, user name, ownership). One file, run
      // serially, only after every parallel spec has finished.
      name: 'exclusive',
      testMatch: /serial-seed-mutations\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE },
      dependencies: ['parallel'],
      fullyParallel: false,
    },
  ],
  webServer: [
    {
      // NODE_ENV=development so the server actually binds the port (index.ts only
      // calls serve() in development); DATABASE_URL overrides the dev value from
      // apps/server/.env (dotenv doesn't override process.env), so it talks to the
      // isolated test DB. Secrets come from apps/server/.env (locally) or the job
      // env (CI).
      command: 'pnpm --filter @homewise/server dev',
      url: `${API_URL}/auth/ok`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { NODE_ENV: 'development', DATABASE_URL: TEST_DATABASE_URL },
    },
    {
      // Serve the production build via `vite preview`, not the dev server: the dev
      // server (per-request module transforms) buckles under concurrent load,
      // whereas the built app serves static assets and handles many parallel
      // contexts comfortably. `VITE_API_URL` is inlined at build time, so it's set
      // on this command. The tsc step is skipped (`vite build` only) —
      // type-checking is a separate gate.
      command: 'pnpm --filter @homewise/web-app exec vite build && pnpm --filter @homewise/web-app exec vite preview',
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      // Longer than the API's: this includes a production build before serving.
      timeout: 180_000,
      env: { VITE_API_URL: API_URL },
    },
  ],
});

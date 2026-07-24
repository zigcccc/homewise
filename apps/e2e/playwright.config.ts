import path from 'node:path';

import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

import { STORAGE_STATE } from './support/paths';

// Optional, git-ignored local overrides (e.g. a custom TEST_DATABASE_URL). CI
// supplies everything it needs via workflow env, so this file is not required.
loadEnv({ path: path.resolve(import.meta.dirname, '.env.test') });

// When PLAYWRIGHT_BASE_URL is set we run against an already-deployed target — the
// PR preview in CI (preview.yml passes the deploy-web alias). In that mode we
// skip booting local servers and provisioning a DB; the preview is already live
// and seeded. Locally (no PLAYWRIGHT_BASE_URL) we boot server + web and stand up
// an isolated test Postgres in globalSetup.
const remoteBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const isLocal = !remoteBaseURL;

const WEB_URL = remoteBaseURL ?? 'http://localhost:3000';
// Only used for the local webServer readiness probe + the web's VITE_API_URL.
const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:5173';
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://user:password@localhost:8766/homewise_test';

// Vercel preview deployments sit behind Bot Protection (a Security Checkpoint that
// blocks headless browsers — "Failed to verify your browser"). A custom Vercel
// Firewall rule on homewise-web matches this secret in the `x-e2e-bypass` header and
// Bypasses the challenge. When the secret is provided (CI sets it from a GitHub
// secret), send it on every request. Absent locally, so local runs are unaffected.
// The server's CORS allow-list includes this header so the cross-origin API calls
// that carry it don't fail preflight (see apps/server/src/config/cors.ts).
const bypassSecret = process.env.E2E_BYPASS_SECRET;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Serial in CI: the two specs share one seeded preview DB, so keep them ordered.
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],
  globalSetup: isLocal ? './support/global-setup.ts' : undefined,
  globalTeardown: isLocal ? './support/global-teardown.ts' : undefined,
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    ...(bypassSecret ? { extraHTTPHeaders: { 'x-e2e-bypass': bypassSecret } } : {}),
  },
  projects: [
    // Logs in the seed user once and saves the session; every other project
    // reuses it via storageState, so tests don't re-authenticate.
    { name: 'setup', testMatch: /auth\.setup\.ts$/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE },
      dependencies: ['setup'],
    },
  ],
  webServer: isLocal
    ? [
        {
          // NODE_ENV=development so the server actually binds the port (index.ts
          // only calls serve() in development); DATABASE_URL overrides the dev
          // value from apps/server/.env (dotenv doesn't override process.env), so
          // it talks to the isolated test DB. Secrets come from apps/server/.env.
          command: 'pnpm --filter @homewise/server dev',
          url: `${API_URL}/auth/ok`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: { NODE_ENV: 'development', DATABASE_URL: TEST_DATABASE_URL },
        },
        {
          command: 'pnpm --filter @homewise/web-app dev',
          url: WEB_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: { VITE_API_URL: API_URL },
        },
      ]
    : undefined,
});

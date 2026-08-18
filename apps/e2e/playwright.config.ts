import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

// Optional, git-ignored local overrides (e.g. a custom TEST_DATABASE_URL). CI
// supplies everything it needs via workflow env, so this file is not required.
loadEnv({ path: path.resolve(import.meta.dirname, '.env.test') });

// The suite always runs the whole app locally — on a dev machine and on CI alike
// (see .github/workflows/ci.yml). globalSetup stands up an isolated test Postgres
// and seeds it; webServer boots the server + the web app served as a production
// build. There is no "run against a deployed preview" mode.
const WEB_URL = 'http://localhost:3000';
// The local webServer readiness probe + the web's VITE_API_URL. Exported because a spec that asserts
// on the API directly (rather than through the browser) needs the same value.
export const API_URL = 'http://localhost:5173';
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://user:password@localhost:8766/homewise_test';
// Realtime channels are prefixed with this, and household ids repeat across databases. A fresh
// value per run keeps a local suite and a CI suite (or two local runs) off each other's channels
// even when they share one Ably app — the same reason preview deploys get `pr-<n>`.
const REALTIME_NAMESPACE = `test-${randomUUID().slice(0, 8)}`;
// Opt in with E2E_WEB_MODE=dev — see the web `webServer` entry for when that's worth doing.
const WEB_DEV_MODE = process.env.E2E_WEB_MODE === 'dev';

export default defineConfig({
  testDir: './tests',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Worker count is a server-capacity knob, not a correctness one — `globalSetup`
  // seeds one household per worker, so isolation holds at any count, including a
  // `--workers` override. We serve the production build (see webServer), which
  // handles this concurrency; both are capped modestly to match the machine's
  // headroom.
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
  // Two phases, sequenced by `dependencies`. The bulk of the suite parallelizes;
  // the specs that mutate their household's own seed rows (its name, the owner's
  // name, ownership itself) stay quarantined in a single-file `exclusive` phase
  // that runs alone at the end. Per-worker households make them safe to run
  // alongside everything else, but a mutator that dies mid-round-trip would leave
  // its household renamed or de-owned for the rest of that worker's tests — going
  // last costs ~10s and takes that away.
  //
  // Sessions come from `support/test.ts`, not from `use.storageState`: each worker
  // signs into its own household's accounts on demand. There is no `setup` project.
  projects: [
    {
      name: 'parallel',
      testIgnore: [/serial-seed-mutations\.spec\.ts$/],
      use: { ...devices['Desktop Chrome'] },
      // Every worker owns a separate household, so tests can run fully concurrently.
      fullyParallel: true,
    },
    {
      name: 'exclusive',
      testMatch: /serial-seed-mutations\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
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
      // Never reuse. `env` below only applies to a process Playwright spawns itself, so adopting a
      // running `pnpm dev` would silently point the whole suite at the DEV database (:8765) instead
      // of the isolated test one — polluting real data and inventing failures from state the seed
      // never resets. Refusing to start when :5173 is busy is the loud, correct alternative.
      reuseExistingServer: false,
      timeout: 120_000,
      // HOMEWISE_DISABLE_EMAILS: the invite specs would otherwise make real Resend calls on every
      // run — rate-limited across three workers, so a flake source, and quota spent on throwaway
      // addresses. Suppressing them tests our own invite rows, which is what the specs assert on.
      // HOMEWISE_ABLY_API_KEY isn't set here because it isn't ours to fake: the server requires it
      // to boot, and the realtime specs assert that one browser sees another's change, which only
      // means anything against the real broker. It comes from apps/server/.env locally and the job
      // env on CI — a run without it fails at startup rather than passing on a mock.
      // HOMEWISE_LOCAL_FILE_STORAGE: Vercel bills every `put` as an *advanced operation*, our
      // scarcest quota by far (2K/month, and exceeding it locks uploads out for the rest of the
      // window) — and the three photo specs spent one each, per run, on a 103-byte fixture. This
      // stores them on local disk and serves them back from the server instead. The specs are
      // unchanged: they still upload real bytes through the real endpoint and still assert the image
      // comes back and renders. What's given up is proof that the Vercel SDK itself still works,
      // which `pnpm dev` exercises by hand every day.
      env: {
        NODE_ENV: 'development',
        DATABASE_URL: TEST_DATABASE_URL,
        HOMEWISE_DISABLE_EMAILS: 'true',
        HOMEWISE_LOCAL_FILE_STORAGE: 'true',
        HOMEWISE_REALTIME_NAMESPACE: REALTIME_NAMESPACE,
      },
    },
    {
      // Serve the production build via `vite preview`, not the dev server: the dev
      // server (per-request module transforms) buckles under concurrent load,
      // whereas the built app serves static assets and handles many parallel
      // contexts comfortably. `VITE_API_URL` is inlined at build time, so it's set
      // on this command. The tsc step is skipped (`vite build` only) —
      // type-checking is a separate gate.
      //
      // `E2E_WEB_MODE=dev` runs against the Vite dev server instead. Worth reaching
      // for when a change touches mount/unmount lifecycles: React StrictMode only
      // double-invokes effects in development, so a component that tears down what
      // it just set up passes here and fails on `pnpm dev`. That exact bug shipped
      // once — an Ably connection closed by its own effect cleanup. Slower and
      // flakier under load, so it's opt-in rather than the default.
      command: WEB_DEV_MODE
        ? 'pnpm --filter @homewise/web-app exec vite dev --port 3000 --strictPort'
        : 'pnpm --filter @homewise/web-app exec vite build && pnpm --filter @homewise/web-app exec vite preview',
      url: WEB_URL,
      // Same reasoning as the API server: a running `vite dev` on :3000 would be adopted, and it
      // was built against whatever VITE_API_URL that session used.
      reuseExistingServer: false,
      // Longer than the API's: this includes a production build before serving.
      timeout: 180_000,
      env: { VITE_API_URL: API_URL },
    },
  ],
});

import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { type FullConfig } from '@playwright/test';

/**
 * Runs everywhere (dev machine and CI alike — CI runs the whole app on the runner,
 * never a deployed preview).
 *
 * Brings the app to a known state before any test runs:
 *   1. start the isolated test Postgres (docker compose `test` profile, :8766),
 *   2. apply migrations to it, then
 *   3. reset + seed the deterministic fixtures the tests assert against.
 *
 * DATABASE_URL points at the test DB for every step; NODE_ENV=test unlocks the
 * seed's SEED_RESET guard (only ever permitted against a preview branch or the
 * test DB — never a real/dev database).
 *
 * The seed gets **one household per Playwright worker** (`SEED_HOUSEHOLD_SLOTS`), which is what
 * keeps `fullyParallel` specs off each other's rows. `config.workers` is the authority on how many:
 * it already accounts for a `--workers` override, so there is no second number to keep in sync, and
 * `support/test.ts` addresses a slot by `parallelIndex`, which is always below it.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const SERVER_DIR = path.resolve(REPO_ROOT, 'apps', 'server');
const COMPOSE_FILE = path.resolve(SERVER_DIR, 'docker-compose.yaml');

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://user:password@localhost:8766/homewise_test';

function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  execFileSync(command, args, { cwd: REPO_ROOT, stdio: 'inherit', env });
}

export default function globalSetup(config: FullConfig) {
  const baseEnv = { ...process.env, DATABASE_URL: TEST_DATABASE_URL };

  console.log('▸ e2e: starting isolated test Postgres (:8766)');
  // Name the service explicitly (it's in the `test` profile, so naming it starts
  // it) — this never touches the dev `postgres` service in the same compose file.
  run('docker', ['compose', '-f', COMPOSE_FILE, 'up', '-d', '--wait', 'postgres-test'], baseEnv);

  console.log('▸ e2e: applying migrations to the test DB');
  run('pnpm', ['--filter', '@homewise/server', 'db:migrations:apply'], baseEnv);

  console.log(`▸ e2e: resetting + seeding the test DB (one household per worker, ${config.workers} in all)`);
  run('pnpm', ['--filter', '@homewise/server', 'db:seed'], {
    ...baseEnv,
    NODE_ENV: 'test',
    SEED_RESET: 'true',
    SEED_HOUSEHOLD_SLOTS: String(config.workers),
  });
}

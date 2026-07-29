import { execFileSync } from 'node:child_process';
import path from 'node:path';

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
 */

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const SERVER_DIR = path.resolve(REPO_ROOT, 'apps', 'server');
const COMPOSE_FILE = path.resolve(SERVER_DIR, 'docker-compose.yaml');

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://user:password@localhost:8766/homewise_test';

function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  execFileSync(command, args, { cwd: REPO_ROOT, stdio: 'inherit', env });
}

export default function globalSetup() {
  const baseEnv = { ...process.env, DATABASE_URL: TEST_DATABASE_URL };

  console.log('▸ e2e: starting isolated test Postgres (:8766)');
  // Name the service explicitly (it's in the `test` profile, so naming it starts
  // it) — this never touches the dev `postgres` service in the same compose file.
  run('docker', ['compose', '-f', COMPOSE_FILE, 'up', '-d', '--wait', 'postgres-test'], baseEnv);

  console.log('▸ e2e: applying migrations to the test DB');
  run('pnpm', ['--filter', '@homewise/server', 'db:migrations:apply'], baseEnv);

  console.log('▸ e2e: resetting + seeding the test DB');
  run('pnpm', ['--filter', '@homewise/server', 'db:seed'], {
    ...baseEnv,
    NODE_ENV: 'test',
    SEED_RESET: 'true',
  });
}

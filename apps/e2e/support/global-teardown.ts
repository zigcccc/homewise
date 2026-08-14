import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * Runs everywhere (dev machine and CI alike). Removes the isolated test Postgres
 * that global-setup started, so `docker ps` stays clean after a run.
 *
 * Scoped to the `postgres-test` service by name — never touches the dev
 * `postgres` service in the same compose file. Best-effort: a failure here must
 * not fail an otherwise-green run.
 *
 * `-v` is load-bearing: the postgres image's data dir is a VOLUME, so `rm` alone leaks one per run.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const COMPOSE_FILE = path.resolve(REPO_ROOT, 'apps', 'server', 'docker-compose.yaml');

export default function globalTeardown() {
  try {
    console.log('▸ e2e: removing test Postgres container');
    execFileSync('docker', ['compose', '-f', COMPOSE_FILE, 'rm', '-sfv', 'postgres-test'], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    });
  } catch (error) {
    console.warn('▸ e2e: test DB teardown failed (ignored):', error);
  }
}

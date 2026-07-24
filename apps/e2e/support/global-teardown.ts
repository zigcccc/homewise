import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * Local-only teardown (skipped in CI, which runs against a deployed preview and
 * never starts a container). Removes the isolated test Postgres that
 * global-setup started, so `docker ps` stays clean after a run.
 *
 * Scoped to the `postgres-test` service by name — never touches the dev
 * `postgres` service in the same compose file. Best-effort: a failure here must
 * not fail an otherwise-green run.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const COMPOSE_FILE = path.resolve(REPO_ROOT, 'apps', 'server', 'docker-compose.yaml');

export default function globalTeardown() {
  try {
    console.log('▸ e2e: removing test Postgres container');
    execFileSync('docker', ['compose', '-f', COMPOSE_FILE, 'rm', '-sf', 'postgres-test'], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    });
  } catch (error) {
    console.warn('▸ e2e: test DB teardown failed (ignored):', error);
  }
}

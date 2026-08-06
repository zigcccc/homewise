import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { Client } from 'pg';

/**
 * Brings up the isolated unit-suite Postgres before any test runs, and removes it afterwards — the
 * same shape as `apps/e2e/support/global-setup.ts`, minus the seed. Unit tests build the rows they
 * need, so the database starts empty rather than holding fixtures to assert against.
 *
 * Its own container and its own port, so `pnpm test` and `pnpm test:e2e` can run at the same time
 * without either writing into the other's data. Neither ever touches the dev DB on 8765.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const COMPOSE_FILE = path.resolve(REPO_ROOT, 'apps', 'server', 'docker-compose.yaml');

/** The one place this URL is written. `vitest.config.ts` puts it on the workers; `vitest.setup.ts` checks it. */
export const UNIT_DATABASE_URL = 'postgres://user:password@localhost:8767/homewise_unit';

function run(command: string, args: string[]) {
  execFileSync(command, args, {
    cwd: REPO_ROOT,
    env: { ...process.env, DATABASE_URL: UNIT_DATABASE_URL },
    stdio: 'inherit',
  });
}

/**
 * Empties every domain table, so a run starts from the same place regardless of what the last one
 * left behind — including a run that was killed before teardown. Discovered from the catalog rather
 * than listed, so a new table can't quietly escape it; `drizzle-kit`'s own bookkeeping is the one
 * thing kept, since dropping it would strand the migrations that were just applied.
 */
async function truncateAll() {
  const client = new Client({ connectionString: UNIT_DATABASE_URL });
  await client.connect();

  try {
    const { rows } = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '__drizzle_migrations'`
    );

    if (rows.length > 0) {
      const tables = rows.map(({ table_name }) => `"${table_name}"`).join(', ');
      await client.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await client.end();
  }
}

export default async function globalSetup() {
  console.log('▸ unit: starting isolated unit Postgres (:8767)');
  // Naming the service is what activates its `unit` profile — this can never start the dev
  // `postgres` service that shares the compose file.
  run('docker', ['compose', '-f', COMPOSE_FILE, 'up', '-d', '--wait', 'postgres-unit']);

  console.log('▸ unit: applying migrations');
  run('pnpm', ['--filter', '@homewise/server', 'db:migrations:apply']);

  await truncateAll();

  return () => {
    try {
      run('docker', ['compose', '-f', COMPOSE_FILE, 'rm', '-sf', 'postgres-unit']);
    } catch {
      // Teardown must never turn a green run red — a leftover container is the next run's problem,
      // and `up -d --wait` will adopt it.
    }
  };
}

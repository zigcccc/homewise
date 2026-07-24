import { Pool as NeonPool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool as PgPool } from 'pg';

import { env } from '@/config/env';
import * as schema from '@/db/schema';

const Pool = env.NODE_ENV === 'production' ? NeonPool : (PgPool as unknown as typeof NeonPool);

const pool = new Pool({ connectionString: env.DATABASE_URL });

// Postgres/socket error codes that just mean a pooled connection went away —
// expected when the DB or network drops, e.g. every time the dev server (or its
// test DB) is torn down. Not actionable for an *idle* pool, so we don't log them.
const BENIGN_IDLE_ERROR_CODES = new Set([
  '57P01', // admin shutdown — "terminating connection due to administrator command"
  '57P02', // crash shutdown
  '57P03', // cannot connect now
  '08006', // connection failure
  '08003', // connection does not exist
  'ECONNRESET',
  'EPIPE',
]);

// The pg Pool emits 'error' for failures on *idle* pooled clients. Without a
// listener node-postgres escalates these to an uncaughtException that crash-dumps
// the client object — the noise you see when the dev server (or its test DB) is
// torn down. Swallow the benign connection-drop codes above; log anything
// genuinely unexpected. Real query errors still surface at their call site.
//
// Non-production only, on purpose: production uses NeonPool and we deliberately
// leave its default behavior untouched — attaching a listener there would silently
// change how prod handles pool errors (an uncaught error stops throwing), which is
// a resilience/observability decision to make separately, not a side effect of a
// dev-noise fix.
if (env.NODE_ENV !== 'production') {
  pool.on('error', (err: Error & { code?: string }) => {
    if (err.code && BENIGN_IDLE_ERROR_CODES.has(err.code)) return;
    console.error('[db] unexpected idle client error:', err);
  });
}

const db = drizzle(pool, { schema, casing: 'snake_case' });

/** Gracefully close the connection pool (used by the dev server's shutdown hooks). */
async function closeDb() {
  await pool.end();
}

export { closeDb, db, schema };

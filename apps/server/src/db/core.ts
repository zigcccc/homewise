import { Pool as NeonPool } from '@neondatabase/serverless';
import { startSpan } from '@sentry/hono/node';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool as PgPool } from 'pg';

import { env } from '@/config/env';
import * as schema from '@/db/schema';

const Pool = env.NODE_ENV === 'production' ? NeonPool : (PgPool as unknown as typeof NeonPool);

const pool = new Pool({ connectionString: env.DATABASE_URL });

type Queryable = { query: (...args: unknown[]) => unknown };
type Connectable = { connect: (...args: unknown[]) => unknown };

/**
 * Pool clients are recycled, so `connect()` hands back objects we've already patched. Marking them
 * keeps a long-lived client from accumulating a wrapper per checkout.
 */
const instrumented = new WeakSet<object>();

/**
 * Turn every statement this client runs into a Sentry span, so a slow endpoint can be attributed to
 * the query responsible instead of just "the handler took 900ms".
 *
 * We do this by hand rather than letting Sentry's OpenTelemetry instrumentation do it, because that
 * one patches the `pg` package — which production never loads (see the driver switch above). Wrapping
 * the pool is the only approach that covers `pg` locally *and* `@neondatabase/serverless` in
 * production, and it's also why `instrument.ts` doesn't need Node's `--import` flag.
 */
function instrumentQueries(client: object) {
  if (instrumented.has(client)) return;
  instrumented.add(client);

  const target = client as Queryable;
  const query = target.query.bind(target);

  target.query = (...args) => {
    // node-postgres also takes a callback as the last argument. That form resolves outside the
    // promise we'd be timing, so the span would close before the query does — leave it untouched.
    if (typeof args.at(-1) === 'function') return query(...args);

    const [config] = args;
    // The SQL text only. Parameters are the row values — names, addresses, medical notes.
    const statement = typeof config === 'string' ? config : (config as { text?: string } | null)?.text;

    return startSpan(
      {
        op: 'db',
        name: statement ?? 'query',
        // Without a request around it (boot-time auth lookups, the seed script) each query would
        // otherwise become a standalone transaction.
        onlyIfParent: true,
        attributes: { 'db.system': 'postgresql' },
      },
      () => query(...args)
    );
  };
}

instrumentQueries(pool);

// Transactions run on a checked-out client rather than the pool, so patching the pool alone would
// miss every `db.transaction(...)` — which is most of the writes in this app.
//
// Patching both looks like it should double-count, since `Pool.query` is itself implemented as
// connect-then-query. It doesn't, for two independent reasons: that internal checkout passes a
// *callback*, and pg-pool's `connect(cb)` returns undefined rather than a promise, so the branch
// below never reaches the client it acquired; and the `client.query(…, cb)` it then runs is the
// callback form `instrumentQueries` skips anyway. Measured against a real pool: one span for
// `pool.query`, one for a checked-out `client.query`. Neon's Pool is the same pg-pool source, so
// this holds in production too.
const connectable = pool as unknown as Connectable;
const connect = connectable.connect.bind(connectable);

connectable.connect = (...args) => {
  const client = connect(...args);

  if (client instanceof Promise) {
    return client.then((connected: unknown) => {
      if (connected && typeof connected === 'object') instrumentQueries(connected);
      return connected;
    });
  }

  return client;
};

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

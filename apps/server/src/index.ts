// Must stay the first import: it calls Sentry.init(), and nothing below can be instrumented before
// that has run. See the comment in that file for why there's no `--import` flag to lean on.
import './instrument';

import app from './app';
import { env } from './config/env';
import { SERVER_PORT } from './config/server';
import { closeDb } from './db/core';

export type { AppType } from './app';

if (env.NODE_ENV === 'development') {
  // Only this branch ever listens — production is invoked by Vercel's runtime, which imports the
  // default export below.
  const { serve } = await import('@hono/node-server');

  console.log(`Serving app on port ${SERVER_PORT}...`);
  const server = serve({ ...app, port: SERVER_PORT });

  // Stop accepting connections, then close the DB pool cleanly so idle clients
  // don't error on an abrupt socket close (which otherwise crash-dumps on the
  // SIGTERM Playwright/`pnpm dev` sends). Both signals share one graceful path.
  const shutdown = () => {
    server.close(() => {
      void closeDb().finally(() => process.exit(0));
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

export default app;

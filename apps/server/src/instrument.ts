import * as Sentry from '@sentry/hono/node';

import { env } from './config/env';

/**
 * Sentry initialisation, kept in its own module so `index.ts` can import it before anything else.
 *
 * Sentry's Node guide wants `node --import ./instrument.mjs`, which we can't use: Vercel builds this
 * app with the `@vercel/hono` builder, which imports the default export of `dist/src/index.js`
 * directly — there is no start command to add a flag to. This is Sentry's documented
 * "ESM without --import" path instead, whose one cost is that only native Node APIs (`http`,
 * `fetch`) get auto-instrumented, not third-party libraries.
 *
 * That cost is zero here. The library we'd most want instrumented is the Postgres driver, and
 * Sentry only patches `pg` — which production never loads, because `db/core.ts` switches to
 * `@neondatabase/serverless` there. So `--import` would buy DB spans in development only. We wrap
 * the pool ourselves instead (see `db/core.ts`), which covers both drivers.
 */
Sentry.init({
  dsn: env.SENTRY_DSN,
  // VERCEL_ENV distinguishes `preview` from `production`; NODE_ENV can't (both are 'production').
  environment: process.env.VERCEL_ENV ?? env.NODE_ENV,
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: 1.0,
  enableLogs: true,
  // Every `console.warn`/`console.error` the app writes becomes a Sentry log — and still prints to
  // the console, so it stays the local signal (Sentry is off here) and the line in Vercel's own log
  // drain. That's the intended pattern for logging in this codebase: write a plain console call and
  // it is visible in all three places, with nothing to remember to instrument.
  integrations: [Sentry.consoleLoggingIntegration({ levels: ['warn', 'error'] })],
  // This app stores children's medical information, contacts and household documents. Errors are
  // worth reporting; the rows that caused them are not. `userInfo` stays at its default so
  // `Sentry.setUser` still identifies *who* hit a bug.
  dataCollection: {
    httpBodies: [],
    cookies: false,
    // Local variables in a service frame are the row being written.
    stackFrameVariables: false,
  },
});

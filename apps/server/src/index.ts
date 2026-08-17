// Must stay the first import: it calls Sentry.init(), and nothing below can be instrumented before
// that has run. See the comment in that file for why there's no `--import` flag to lean on.
import './instrument';

import { flush, sentry, setUser } from '@sentry/hono/node';
import { waitUntil } from '@vercel/functions';
import { Hono } from 'hono';
import { logger } from 'hono/logger';

import { corsConfig } from './config/cors';
import { env } from './config/env';
import { SERVER_PORT } from './config/server';
import { closeDb } from './db/core';
import { auth, forwardAuthCookies } from './lib/auth';
import activityApp from './modules/activity';
import childDictionariesApp from './modules/child-dictionaries';
import childProfilesApp from './modules/child-profiles';
import contactsApp from './modules/contacts';
import expenseCategoriesApp from './modules/expense-categories';
import expensesApp from './modules/expenses';
import householdsApp from './modules/households';
import { localStore } from './modules/images/images.store';
import ingredientsApp from './modules/ingredients';
import mealPlanApp from './modules/meal-plan';
import medicalApp from './modules/medical';
import petProfilesApp from './modules/pet-profiles';
import realtimeApp from './modules/realtime';
import recipesApp from './modules/recipes';
import shoppingListsApp from './modules/shopping-lists';
import storageItemsApp from './modules/storage-items';
import storageLocationsApp from './modules/storage-locations';
import storesApp from './modules/stores';
import usersApp from './modules/users';
import { type AppContext } from './types/app.type';

// The Sentry middleware needs the app instance (it installs `onError` on it), so the chain can't
// start straight off the constructor any more. `.use()` mutates and returns the same object, so
// `base` and `app` below are one instance — `AppType` stays inferable, which is what the web's RPC
// client is typed against.
const base = new Hono<AppContext>();

// Registered first, so its post-`next()` half runs last — after Sentry has finished recording the
// request. Vercel freezes the function the moment the response is on its way, dropping whatever is
// still buffered; `waitUntil` keeps it alive for the flush without delaying the response.
base.use(async (_c, next) => {
  await next();

  if (process.env.VERCEL) waitUntil(flush(2000));
});

// 3xx/4xx are excluded by default, which is what we want: the ~60 `HTTPException`s in the services
// are expected 400/404/409 responses, not incidents.
base.use(sentry(base));

// Serves what `HOMEWISE_LOCAL_FILE_STORAGE` wrote (E2E only — the env refuses the flag outside
// development/test). Registered on `base`, so it sits ahead of the session guard below and stays out
// of `AppType`: these URLs are `<img src>`s from another origin, which carry no cookies and would
// otherwise 401, and no client calls this through the RPC client.
base.get('/files/*', async (c) => {
  if (!env.HOMEWISE_LOCAL_FILE_STORAGE) {
    return c.notFound();
  }

  const file = await localStore.read(c.req.path.replace('/files/', ''));
  if (!file) {
    return c.notFound();
  }

  // An SVG can carry script, and this serves it from the API's own origin — the CDN it stands in for
  // wouldn't. Cheap enough to keep on even though the flag confines the route to development/test.
  return c.body(file.body, 200, {
    'Content-Security-Policy': "default-src 'none'",
    'X-Content-Type-Options': 'nosniff',
    ...(file.contentType ? { 'Content-Type': file.contentType } : {}),
  });
});

const app = base
  .use(logger())
  // CORS rules
  .use('/*', corsConfig)
  // Auth handlers
  .on(['POST', 'GET'], '/auth/*', (c) => {
    // c.header('Access-Control-Allow-Credentials', 'true');
    return auth.handler(c.req.raw);
  })
  // Auth guard
  .use('*', async (c, next) => {
    const { headers, response: session } = await auth.api.getSession({
      headers: c.req.raw.headers,
      returnHeaders: true,
    });

    if (!session) {
      return c.body(null, 401);
    }

    c.set('user', session.user);
    c.set('session', session.session);
    setUser({ id: session.user.id, email: session.user.email });

    await next();

    // Re-warms the session cookie cache when the read above missed it; without this only a full page
    // load, which calls /auth/get-session directly, could ever reinstate it. Skipped when the handler
    // set its own cookies: this snapshot predates the write it just made, so forwarding it would put
    // the pre-update user back in the cache.
    if (c.res.headers.getSetCookie().length === 0) {
      forwardAuthCookies(c, headers);
    }
  });

const routes = app
  .route('/users', usersApp)
  .route('/households', householdsApp)
  .route('/child-profiles', childProfilesApp)
  .route('/child-dictionaries', childDictionariesApp)
  .route('/pet-profiles', petProfilesApp)
  .route('/contacts', contactsApp)
  .route('/medical-info', medicalApp)
  .route('/recipes', recipesApp)
  .route('/ingredients', ingredientsApp)
  .route('/stores', storesApp)
  .route('/meal-plan', mealPlanApp)
  .route('/shopping-lists', shoppingListsApp)
  .route('/expenses', expensesApp)
  .route('/expense-categories', expenseCategoriesApp)
  .route('/storage-locations', storageLocationsApp)
  .route('/storage-items', storageItemsApp)
  .route('/realtime', realtimeApp)
  .route('/activity', activityApp);

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

/** The contract the web's RPC client is typed against. */
export type AppType = typeof routes;

export default app;

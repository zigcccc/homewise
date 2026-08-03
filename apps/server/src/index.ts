// Must stay the first import: it calls Sentry.init(), and nothing below can be instrumented before
// that has run. See the comment in that file for why there's no `--import` flag to lean on.
import './instrument';

import { serve } from '@hono/node-server';
import { flush, sentry, setUser } from '@sentry/hono/node';
import { waitUntil } from '@vercel/functions';
import { Hono } from 'hono';
import { logger } from 'hono/logger';

import { corsConfig } from './config/cors';
import { env } from './config/env';
import { closeDb } from './db';
import { auth } from './lib/auth';
import childDictionariesApp from './modules/child-dictionaries';
import childProfilesApp from './modules/child-profiles';
import contactsApp from './modules/contacts';
import householdsApp from './modules/households';
import ingredientsApp from './modules/ingredients';
import mealPlanApp from './modules/meal-plan';
import medicalApp from './modules/medical';
import petProfilesApp from './modules/pet-profiles';
import realtimeApp from './modules/realtime';
import recipesApp from './modules/recipes';
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
    const session = await auth.api.getSession({ headers: c.req.raw.headers });

    if (!session) {
      return c.body(null, 401);
    }

    c.set('user', session.user);
    c.set('session', session.session);
    setUser({ id: session.user.id, email: session.user.email });

    return next();
  })
  // App routes
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
  .route('/realtime', realtimeApp);

if (env.NODE_ENV === 'development') {
  console.log('Serving app on port 5173...');
  const server = serve({ ...app, port: 5173 });

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

export type AppType = typeof app;
export default app;

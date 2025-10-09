import { Hono } from 'hono';
import { logger } from 'hono/logger';

import { corsConfig } from './config/cors';
import { auth } from './lib/auth';
import expnensesApp from './modules/expenses';
import { type AppContext } from './types/app.type';

const app = new Hono<AppContext>()
  .use(logger())
  // CORS rules
  .use('/*', corsConfig)
  // Auth handlers
  .on(['POST', 'GET'], '/auth/**', (c) => {
    c.header('Access-Control-Allow-Credentials', 'true');
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

    return next();
  })
  // App routes
  .route('/expenses', expnensesApp);

export type AppType = typeof app;
export default app;

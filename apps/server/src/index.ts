import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';

import { corsConfig } from './config/cors';
import { env } from './config/env';
import { auth } from './lib/auth';
import childDictionariesApp from './modules/child-dictionaries';
import childProfilesApp from './modules/child-profiles';
import contactsApp from './modules/contacts';
import householdsApp from './modules/households';
import medicalApp from './modules/medical';
import petProfilesApp from './modules/pet-profiles';
import usersApp from './modules/users';
import { type AppContext } from './types/app.type';

const app = new Hono<AppContext>()
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

    return next();
  })
  // App routes
  .route('/users', usersApp)
  .route('/households', householdsApp)
  .route('/child-profiles', childProfilesApp)
  .route('/child-dictionaries', childDictionariesApp)
  .route('/pet-profiles', petProfilesApp)
  .route('/contacts', contactsApp)
  .route('/medical-info', medicalApp);

if (env.NODE_ENV === 'development') {
  console.log('Serving app on port 5173...');
  const server = serve({ ...app, port: 5173 });

  process.on('SIGINT', () => {
    server.close();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    server.close((err) => {
      if (err) {
        console.error(err);
        process.exit(1);
      }
      process.exit(0);
    });
  });
}

export type AppType = typeof app;
export default app;

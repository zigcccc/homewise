import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

import expnensesApp from './modules/expenses';

const allowedOrigins = ['http://localhost:3000', 'https://www.home-wise.app', 'https://home-wise.app'];

const app = new Hono()
  .use(logger())
  .use('/*', cors({ origin: allowedOrigins }))
  .route('/expenses', expnensesApp);

export type AppType = typeof app;
export default app;

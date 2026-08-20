import { Hono } from 'hono';

import { zValidator } from '#lib/validation';
import { withHousehold } from '#middleware/household.middleware';
import { type AppContext } from '#types/app.type';

import { listActivityQueryParamsModel } from './activity.model';
import { ActivityService } from './activity.service';

/**
 * The household's activity feed. Read-only by construction — rows are written by `withHousehold` as
 * a side effect of every other module's mutations, never by a request aimed here — so there is no
 * emit to make and no write to guard. Fully collaborative: what the household did is the household's.
 */
const activityApp = new Hono<AppContext>()
  .use(withHousehold('activity'))
  .get('/', zValidator('query', listActivityQueryParamsModel), async (c) => {
    const page = await ActivityService.list(c.var.household.id, c.req.valid('query'));

    return c.json(page, 200);
  });

export default activityApp;

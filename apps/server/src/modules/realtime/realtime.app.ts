import { Hono } from 'hono';

import { withHousehold } from '#middleware/household.middleware';
import { type AppContext } from '#types/app.type';

import { RealtimeService } from './realtime.service';

/**
 * Everything a browser needs to listen to its household's changes. Under `withHousehold`, so a
 * caller without a household gets a 404 and no credential at all.
 *
 * Split in two on purpose: the channel name is stable enough to resolve in a route loader and hand
 * to `<ChannelProvider>` synchronously, while the token is short-lived and re-fetched by the Ably
 * SDK on its own schedule.
 */
const realtimeApp = new Hono<AppContext>()
  .use(withHousehold)
  .get('/channel', async (c) => c.json({ name: RealtimeService.channelName(c.var.household.id) }, 200))
  .post('/auth', async (c) => {
    const tokenRequest = await RealtimeService.createTokenRequest(c.var.user.id, c.var.household.id);

    return c.json(tokenRequest, 200);
  });

export default realtimeApp;

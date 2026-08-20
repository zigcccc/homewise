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
 *
 * Both are GETs, including the token mint: it grants `subscribe` and changes nothing, so a POST would
 * have made this the one sub-app whose permission area needed a write grant it never uses.
 */
const realtimeApp = new Hono<AppContext>()
  .use(withHousehold('realtime'))
  .get('/channel', async (c) => c.json({ name: RealtimeService.channelName(c.var.household.id) }, 200))
  .get('/auth', async (c) => {
    const tokenRequest = await RealtimeService.createTokenRequest(c.var.user.id, c.var.household.id);

    // A signed credential, and now a GET — which is exactly what a browser or proxy would happily keep.
    return c.json(tokenRequest, 200, { 'Cache-Control': 'no-store' });
  });

export default realtimeApp;

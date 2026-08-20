import * as Ably from 'ably';

import { client, parseResponse } from '@/api/client';

const $createRealtimeToken = client.realtime.auth.$get;

/**
 * The tab's one Ably connection, opened when this module is first evaluated and never replaced —
 * one socket per tab for as long as the tab lives, which is what the SDK is built around.
 *
 * Constructing at module scope means the *import graph* decides when the socket opens, so this file
 * is deliberately kept out of `modules/realtime`'s barrel: it's reachable only from
 * `realtime-provider.tsx`, which only `_onboarded`'s component imports. TanStack Router's
 * `autoCodeSplitting` therefore lands it in that route's component chunk, which never loads for a
 * signed-out visitor. Re-exporting it from the barrel would pull it into the main bundle — the
 * route's `beforeLoad` imports the barrel for the channel query — and `/login` would start dialling
 * out. `realtime-bundling.spec.ts` guards exactly that.
 */
export const realtimeClient = new Ably.Realtime({
  // Not `authUrl`: Ably's own fetch doesn't send credentials, and our session is a cross-origin
  // cookie. Going through the RPC client reuses the same credentialed request every other call makes.
  authCallback: (_params, callback) => {
    parseResponse($createRealtimeToken()).then(
      (tokenRequest) => callback(null, tokenRequest),
      (error: unknown) => callback(error as Ably.ErrorInfo, null)
    );
  },
});

import { type Page } from '@playwright/test';

import { expect } from './test';

/** Ably's `ATTACHED` — the channel is subscribed and messages published from now on arrive. */
const ATTACHED = '"action":11';

/**
 * Watches for this tab actually subscribing. **Call it before the tab navigates**, then await the
 * returned function at the point the other context is about to act.
 *
 * A tab that has rendered is not yet listening: the socket opens, a token is fetched, then the
 * channel attaches — and anything published before that lands is simply missed, for good. A spec
 * whose *other* context acts the moment the first has loaded is racing all three, which is what makes
 * these specs flaky. The token response is not enough; attach is a further round trip.
 *
 * Read off the wire rather than out of the app, so nothing exists in the product for the sake of this
 * — the SDK's frames are JSON text in the browser. If that ever changes the predicate stops matching
 * and these specs time out, which is a visible failure rather than a silent one.
 */
export function realtimeListening(page: Page) {
  let attached = false;

  page.on('websocket', (socket) => {
    socket.on('framereceived', (frame) => {
      if (typeof frame.payload === 'string' && frame.payload.includes(ATTACHED)) {
        attached = true;
      }
    });
  });

  return async () => {
    await expect.poll(() => attached, { timeout: 30_000 }).toBe(true);
  };
}

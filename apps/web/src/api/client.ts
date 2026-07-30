import { DetailedError, hc, parseResponse } from 'hono/client';

import { type AppType } from '@homewise/server';

/**
 * Identifies this tab for the lifetime of the page. The server stamps it onto the realtime events a
 * request produces, so the tab that made the change can ignore its own echo — it already
 * invalidated locally, immediately, without waiting for a round trip through the broker.
 *
 * Per tab rather than per user on purpose: a second tab of the *same* user is showing stale data
 * and does want the refresh.
 */
export const CLIENT_ID = crypto.randomUUID();

export const client = hc<AppType>(import.meta.env.VITE_API_URL ?? 'http://localhost:5173', {
  headers: { 'x-homewise-client-id': CLIENT_ID },
  init: { credentials: 'include' },
});

export { DetailedError, parseResponse };

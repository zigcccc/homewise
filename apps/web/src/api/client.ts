import { type AppType } from '@homewise/server';
import { DetailedError, hc, parseResponse } from 'hono/client';

export const client = hc<AppType>(import.meta.env.VITE_API_URL ?? 'http://localhost:5173', {
  init: { credentials: 'include' },
});

export { DetailedError, parseResponse };

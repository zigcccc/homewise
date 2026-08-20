import { cors } from 'hono/cors';

// Origins allowed in every environment (production domains + local dev).
export const allowedOrigins = [
  'http://localhost:3000',
  'https://dashboard.home-wise.app',
  'https://www.home-wise.app',
  'https://home-wise.app',
];

// In a Vercel preview, trust ONLY the exact web origin paired with this server
// preview. The CI pipeline deploys the web to a deterministic alias
// (homewise-web-pr-<n>.vercel.app) and injects it here as PREVIEW_WEB_ORIGIN, so
// we don't fall back to a broad *.vercel.app pattern that would trust any other
// PR's preview. Production has no PREVIEW_WEB_ORIGIN and VERCEL_ENV!=preview, so
// it never trusts a *.vercel.app origin.
const previewWebOrigin = process.env.PREVIEW_WEB_ORIGIN;
const isPreviewEnv = process.env.VERCEL_ENV === 'preview';

export function isAllowedOrigin(origin: string | null | undefined): origin is string {
  if (!origin) return false;
  return allowedOrigins.includes(origin) || (isPreviewEnv && !!previewWebOrigin && origin === previewWebOrigin);
}

export const corsConfig = cors({
  origin: (origin) => (isAllowedOrigin(origin) ? origin : null),
  // X-Homewise-Client-Id identifies the calling tab so realtime can skip echoing a change back to
  // whoever made it. Every mutating request carries it, so leaving it out fails the preflight.
  //
  // Sentry-Trace and Baggage carry the browser's trace id onto the server request, which is what
  // stitches a page load and the API calls it made into one distributed trace. These are not
  // optional once the web app has a DSN: browser tracing adds both headers to every request matching
  // its propagation targets, and a preflight that doesn't allow them makes the browser block the
  // request — so dropping them here doesn't cost you traces, it takes the whole app down. Measured:
  // with a DSN configured and these two removed, even signing in fails.
  allowHeaders: ['Content-Type', 'Authorization', 'X-Homewise-Client-Id', 'Sentry-Trace', 'Baggage'],
  allowMethods: ['POST', 'GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  exposeHeaders: ['Content-Length', 'Access-Control-Allow-Credentials'],
  maxAge: 600,
  credentials: true,
});

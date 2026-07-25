import { cors } from 'hono/cors';

// Origins allowed in every environment (production domains + local dev).
export const allowedOrigins = ['http://localhost:3000', 'https://www.home-wise.app', 'https://home-wise.app'];

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
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['POST', 'GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  exposeHeaders: ['Content-Length', 'Access-Control-Allow-Credentials'],
  maxAge: 600,
  credentials: true,
});

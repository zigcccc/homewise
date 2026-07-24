import { cors } from 'hono/cors';

// Origins allowed in every environment (production domains + local dev).
export const allowedOrigins = ['http://localhost:3000', 'https://www.home-wise.app', 'https://home-wise.app'];

// Vercel preview deployments serve the web app from a per-deployment origin such as
// https://homewise-web-git-<branch>-<team>.vercel.app (and a per-commit hash variant).
// Those are dynamic, so we allow them by pattern — but ONLY when running in Vercel's
// preview environment, so production never trusts a *.vercel.app origin.
const previewWebOrigin = /^https:\/\/homewise-web-[a-z0-9-]+\.vercel\.app$/;
const isPreviewEnv = process.env.VERCEL_ENV === 'preview';

export function isAllowedOrigin(origin: string | null | undefined): origin is string {
  if (!origin) return false;
  return allowedOrigins.includes(origin) || (isPreviewEnv && previewWebOrigin.test(origin));
}

export const corsConfig = cors({
  origin: (origin) => (isAllowedOrigin(origin) ? origin : null),
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['POST', 'GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  exposeHeaders: ['Content-Length', 'Access-Control-Allow-Credentials'],
  maxAge: 600,
  credentials: true,
});

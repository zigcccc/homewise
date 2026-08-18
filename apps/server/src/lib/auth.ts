import { captureException } from '@sentry/hono/node';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { oneTimeToken, openAPI } from 'better-auth/plugins';
import { type Context } from 'hono';

import { allowedOrigins, isAllowedOrigin } from '#config/cors';
import { env } from '#config/env';
import { db, schema } from '#db/core';

import { sendEmail } from './resend';

/**
 * Copies the cookies a `auth.api.*` call produced onto our own response.
 *
 * Required by the session cookie cache below: better-auth rewrites the cached session whenever it
 * reads the database, and a caller that drops those headers leaves the browser holding a stale copy
 * — which is how a just-changed name or avatar keeps rendering until the cache ages out.
 */
export function forwardAuthCookies(c: Context, headers: Headers) {
  for (const cookie of headers.getSetCookie()) {
    c.res.headers.append('Set-Cookie', cookie);
  }
}

// In a Vercel preview, the web and the API live on two *different* sites:
// `vercel.app` is on the Public Suffix List, so homewise-web-pr-<n>.vercel.app
// and homewise-api-pr-<n>.vercel.app are cross-site (unlike production, where
// home-wise.app / api.home-wise.app share a registrable domain and are same-site).
// A default `SameSite=Lax` session cookie is therefore NOT sent on the web's
// cross-site XHR to the API, so get-session reads empty and the auth guard bounces
// back to /login right after a successful login. `SameSite=None; Secure` fixes it.
// Scope it to preview only: localhost dev is http, where a Secure cookie is dropped.
const isPreviewEnv = process.env.VERCEL_ENV === 'preview';

export const auth = betterAuth({
  appName: 'Homewise Auth',
  basePath: '/auth',
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  advanced: isPreviewEnv ? { defaultCookieAttributes: { sameSite: 'none', secure: true } } : undefined,
  plugins:
    env.NODE_ENV !== 'production'
      ? [openAPI(), oneTimeToken({ expiresIn: 60 * 24 })]
      : [oneTimeToken({ expiresIn: 60 * 24 })],
  trustedOrigins: (request) => {
    const origin = request?.headers.get('origin');
    return isAllowedOrigin(origin) ? [...allowedOrigins, origin] : [...allowedOrigins];
  },
  secret: env.BETTER_AUTH_SECRET,
  // Serves the session from a signed cookie so the auth guard stops querying Postgres per request.
  // The cookie carries identity only — every permission is re-read from the database by
  // `withHousehold` — but a session revoked elsewhere stays usable until it ages out.
  session: { cookieCache: { enabled: true, maxAge: 300 } },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        defaultValue: 'user',
        input: false,
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    autoSignIn: true,
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    async sendVerificationEmail({ user, url }) {
      // Loaded on send: statically, these pull React and react-dom/server into every cold start for
      // a path that only runs at sign-up.
      const [{ render }, { VerifyEmail }] = await Promise.all([import('react-email'), import('#emails/VerifyEmail')]);

      const html = await render(VerifyEmail({ url, userName: user.name }));

      try {
        await sendEmail({
          from: 'Homewise 🏡 <no-reply@home-wise.app>',
          to: user.email,
          subject: 'Verify your email address',
          html,
        });
      } catch (error) {
        // Preserves the previous behaviour — a provider failure must not fail the sign-up itself —
        // but logs it instead of discarding it silently. The user can request a new link.
        // Correlate by user id, not email address, so logs carry no recipient PII.
        console.error(`✗ verification email failed for user ${user.id}; sign-up itself succeeded`, error);
        // The id goes on `user`, not a tag: it's the same identity `setUser` carries everywhere else
        // (id only, never the address), and one value per user would blow out a tag's cardinality.
        captureException(error, { tags: { emailKind: 'verification' }, user: { id: user.id } });
      }
    },
  },
});

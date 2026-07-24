import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { oneTimeToken, openAPI } from 'better-auth/plugins';
import { render } from 'react-email';

import { allowedOrigins, isAllowedOrigin } from '@/config/cors';
import { env } from '@/config/env';
import { db, schema } from '@/db';
import { VerifyEmail } from '@/emails/VerifyEmail';

import { resend } from './resend';

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
      const html = await render(VerifyEmail({ url, userName: user.name }));
      await resend.emails.send({
        from: 'Homewise 🏡 <no-reply@home-wise.app>',
        to: user.email,
        subject: 'Verify your email address',
        html,
      });
    },
  },
});

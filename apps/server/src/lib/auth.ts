import { render } from '@react-email/components';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { oneTimeToken, openAPI } from 'better-auth/plugins';

import { allowedOrigins } from '@/config/cors';
import { env } from '@/config/env';
import { db, schema } from '@/db';
import { VerifyEmail } from '@/emails/VerifyEmail';

import { resend } from './resend';

export const auth = betterAuth({
  appName: 'Homewise Auth',
  basePath: '/auth',
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  plugins:
    env.NODE_ENV !== 'production'
      ? [openAPI(), oneTimeToken({ expiresIn: 60 * 24 })]
      : [oneTimeToken({ expiresIn: 60 * 24 })],
  trustedOrigins: allowedOrigins,
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

import VerifyEmail from '@homewise/emails/VerifyEmail';
import { render } from '@react-email/components';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { openAPI } from 'better-auth/plugins';

import { allowedOrigins } from '@/config/cors';
import { env } from '@/config/env';
import { db, schema } from '@/db';

import { resend } from './resend';

export const auth = betterAuth({
  appName: 'Homewise Auth',
  basePath: '/auth',
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  plugins: env.NODE_ENV !== 'production' ? [openAPI()] : [],
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
      console.log('[DEBUG] Entering send verification mail flow...');
      const html = await render(VerifyEmail({ url, userName: user.name }));
      console.log('[DEBUG] Created HTML string for email', html);
      await resend.emails.send({
        from: 'Homewise 🏡 <no-reply@home-wise.app>',
        to: user.email,
        subject: 'Verify your email address 👀',
        html,
      });
    },
  },
});

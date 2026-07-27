import dotenv from 'dotenv';
import z from 'zod';

dotenv.config();

const nodeEnv = z.enum(['development', 'production', 'test']);

const envModel = z.object({
  HOMEWISE_RESEND_API_KEY: z.string(),
  BETTER_AUTH_SECRET: z.string(),
  DATABASE_URL: z.string(),
  NODE_ENV: nodeEnv.default('development'),
  /**
   * Suppresses every outbound transactional email. Set by the E2E suite's webServer: tests would
   * otherwise make real Resend calls on each run, which burns quota and turns the provider's rate
   * limit into flaky failures. Never set in production.
   */
  HOMEWISE_DISABLE_EMAILS: z.stringbool().default(false),
});

const parsedEnv = envModel.safeParse(process.env);

if (!parsedEnv.success) {
  console.error(parsedEnv.error.message);
  process.exit(1);
}

export const env = parsedEnv.data;

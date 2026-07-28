import dotenv from 'dotenv';
import z from 'zod';

dotenv.config();

const nodeEnv = z.enum(['development', 'production', 'test']);

const envModel = z
  .object({
    HOMEWISE_RESEND_API_KEY: z.string(),
    BETTER_AUTH_SECRET: z.string(),
    DATABASE_URL: z.string(),
    /**
     * Optional here, defaulted after the refine below — parsing it as `undefined` first is what lets
     * that check tell "explicitly development" apart from "never set".
     */
    NODE_ENV: nodeEnv.optional(),
    /**
     * Suppresses every outbound transactional email. Set by the E2E suite's webServer: tests would
     * otherwise make real Resend calls on each run, which burns quota and turns the provider's rate
     * limit into flaky failures.
     */
    HOMEWISE_DISABLE_EMAILS: z.stringbool().default(false),
  })
  // Suppressing mail is only ever right locally or under the E2E suite, and it has to be asked for
  // deliberately. A boot with emails suppressed swallows every verification and invite mail —
  // nobody could sign up, and nothing would look broken — so an environment that merely forgot to
  // set NODE_ENV must not fall through the default below into that state. Fail closed instead.
  .refine(
    ({ HOMEWISE_DISABLE_EMAILS, NODE_ENV }) =>
      !HOMEWISE_DISABLE_EMAILS || NODE_ENV === 'development' || NODE_ENV === 'test',
    {
      message: 'HOMEWISE_DISABLE_EMAILS requires NODE_ENV to be explicitly set to development or test',
      path: ['HOMEWISE_DISABLE_EMAILS'],
    }
  )
  // Everything else keeps the old convenience: an unset NODE_ENV is a local boot.
  .transform((parsed) => ({ ...parsed, NODE_ENV: parsed.NODE_ENV ?? ('development' as const) }));

const parsedEnv = envModel.safeParse(process.env);

if (!parsedEnv.success) {
  console.error(parsedEnv.error.message);
  process.exit(1);
}

export const env = parsedEnv.data;

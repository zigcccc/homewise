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
    /**
     * Ably key for the realtime layer. Required, like the DB and auth secret: collaborative editing
     * is what the app is for, and a household whose members silently stop seeing each other's
     * changes is broken in a way nobody would notice or report. Refusing to boot is the only
     * failure mode that gets looked at.
     *
     * `.min(1)` because a blank value is the realistic mistake — an env var declared but never
     * filled in passes a bare `z.string()`, then surfaces much later as an opaque Ably auth error.
     */
    HOMEWISE_ABLY_API_KEY: z.string().min(1),
    /**
     * Channel prefix isolating one deployment's realtime traffic from another's. Household ids
     * repeat across databases — local, each PR preview and production all have a household `1` —
     * so without a prefix a single Ably app would deliver production events to a dev machine.
     *
     * Optional here, defaulted after the refine below — the same trick as `NODE_ENV`: parsing it as
     * `undefined` first is what lets that check tell "deliberately local" apart from "never set".
     */
    HOMEWISE_REALTIME_NAMESPACE: z.string().trim().min(1).optional(),
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
  // The `local` default below is a local-development convenience, and a deployment that merely
  // forgot this variable must not inherit it: it would publish to `local:household:<id>`, the same
  // channels every dev machine pointed at that Ably app is subscribed to. That failure is invisible
  // — realtime keeps working — right up until a colliding household id delivers one environment's
  // events to another, which is the whole thing the prefix exists to prevent. Fail closed instead.
  .refine(
    ({ HOMEWISE_REALTIME_NAMESPACE, NODE_ENV }) =>
      NODE_ENV !== 'production' || HOMEWISE_REALTIME_NAMESPACE !== undefined,
    {
      message: 'HOMEWISE_REALTIME_NAMESPACE must be set explicitly when NODE_ENV is production',
      path: ['HOMEWISE_REALTIME_NAMESPACE'],
    }
  )
  // Everything else keeps the old convenience: an unset NODE_ENV is a local boot.
  .transform((parsed) => ({
    ...parsed,
    HOMEWISE_REALTIME_NAMESPACE: parsed.HOMEWISE_REALTIME_NAMESPACE ?? 'local',
    NODE_ENV: parsed.NODE_ENV ?? ('development' as const),
  }));

const parsedEnv = envModel.safeParse(process.env);

if (!parsedEnv.success) {
  console.error(parsedEnv.error.message);
  process.exit(1);
}

export const env = parsedEnv.data;

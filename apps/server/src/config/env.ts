import dotenv from 'dotenv';
import z from 'zod';

import { SERVER_PORT } from './server';

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
     * Vercel blob token. Required unless `HOMEWISE_LOCAL_FILE_STORAGE` is on — see the refine below,
     * which is what keeps the old guarantee: every profile picture, kid and pet photo goes through
     * one store or the other, so with neither configured the app boots fine and then fails the first
     * time anyone uploads anything — as an opaque error from the storage SDK, far from the cause.
     *
     * `.min(1)` because a declared-but-empty variable is the realistic mistake, and an empty token
     * reaches the SDK as a credential rather than as "unset".
     */
    HOMEWISE_FILES_READ_WRITE_TOKEN: z.string().min(1).optional(),
    /**
     * Stores uploads in a local directory this process serves, instead of Vercel blob. Set by the
     * E2E suite's webServer: `put` bills as a Vercel *advanced operation*, by far our scarcest quota,
     * and the three photo specs spent one each on every run — for 103 bytes nobody reads again. The
     * specs are unchanged by it; they still upload real bytes through the real endpoint and still
     * assert the image comes back and renders, now from us rather than from Vercel's CDN.
     */
    HOMEWISE_LOCAL_FILE_STORAGE: z.stringbool().default(false),
    /**
     * Channel prefix isolating one deployment's realtime traffic from another's. Household ids
     * repeat across databases — local, each PR preview and production all have a household `1` —
     * so without a prefix a single Ably app would deliver production events to a dev machine.
     *
     * Optional here, defaulted after the refine below — the same trick as `NODE_ENV`: parsing it as
     * `undefined` first is what lets that check tell "deliberately local" apart from "never set".
     */
    HOMEWISE_REALTIME_NAMESPACE: z.string().trim().min(1).optional(),
    /**
     * Sentry ingestion endpoint for the server project. Deliberately optional, and deliberately
     * *not* guarded by a fail-closed refine like the two above: an unset DSN turns the SDK into a
     * no-op, which is exactly what local development and the E2E suite want. A missing DSN degrades
     * observability; it doesn't put the product into a broken state nobody would notice.
     *
     * A *malformed* one is a different thing from a missing one — somebody tried to configure this
     * and got it wrong, and the SDK's own reaction is a line on stderr and a silent no-op. So the
     * shape is checked, which makes that boot fail instead. An empty string still counts as unset:
     * a blank env var in the dashboard is how you turn Sentry off for an environment, and it must
     * not be the thing that stops the server starting.
     */
    /**
     * Public origin this server is reached at, e.g. `https://api.home-wise.app`. better-auth builds
     * its callback and redirect URLs from it; since 1.7 it warns at boot when it has none and falls
     * back to deriving one per request, which is wrong the moment a proxy or a preview alias sits in
     * front. better-auth reads this variable's name itself, so setting it in the deployment is
     * enough — the default below only covers local development and the E2E suite.
     *
     * Deliberately not fail-closed: an unset value leaves 1.6's behaviour, so refusing to boot would
     * take deployments down for a warning rather than for a break.
     */
    BETTER_AUTH_URL: z.url().optional(),
    SENTRY_DSN: z
      .union([z.url(), z.literal('')])
      .optional()
      .transform((dsn) => dsn || undefined),
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
  // Serving uploads off the local disk is only ever right locally or under the E2E suite, and it has
  // to be asked for deliberately — the same fail-closed shape as the check above, for the same
  // reason. A deployment that fell into it would write every photo onto an ephemeral function
  // filesystem and hand out `localhost` URLs, and nothing about that surfaces as an error.
  .refine(
    ({ HOMEWISE_LOCAL_FILE_STORAGE, NODE_ENV }) =>
      !HOMEWISE_LOCAL_FILE_STORAGE || NODE_ENV === 'development' || NODE_ENV === 'test',
    {
      message: 'HOMEWISE_LOCAL_FILE_STORAGE requires NODE_ENV to be explicitly set to development or test',
      path: ['HOMEWISE_LOCAL_FILE_STORAGE'],
    }
  )
  // At least one store has to be configured (local storage wins when both are). Uploads are the one
  // thing here with two backends, so the token stops being unconditionally required — but "neither"
  // must still refuse to boot, or the first upload fails as an opaque SDK error long after the mistake.
  .refine(
    ({ HOMEWISE_FILES_READ_WRITE_TOKEN, HOMEWISE_LOCAL_FILE_STORAGE }) =>
      HOMEWISE_LOCAL_FILE_STORAGE || HOMEWISE_FILES_READ_WRITE_TOKEN !== undefined,
    {
      message: 'HOMEWISE_FILES_READ_WRITE_TOKEN is required unless HOMEWISE_LOCAL_FILE_STORAGE is set',
      path: ['HOMEWISE_FILES_READ_WRITE_TOKEN'],
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
    BETTER_AUTH_URL:
      parsed.BETTER_AUTH_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `http://localhost:${SERVER_PORT}`),
    HOMEWISE_REALTIME_NAMESPACE: parsed.HOMEWISE_REALTIME_NAMESPACE ?? 'local',
    NODE_ENV: parsed.NODE_ENV ?? ('development' as const),
  }));

const parsedEnv = envModel.safeParse(process.env);

if (!parsedEnv.success) {
  console.error(parsedEnv.error.message);
  process.exit(1);
}

export const env = parsedEnv.data;

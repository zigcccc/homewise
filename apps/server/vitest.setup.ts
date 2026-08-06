import { UNIT_DATABASE_URL } from './vitest.global-setup';

/**
 * Refuses to run a test against anything but the unit database.
 *
 * `#config/env` calls `dotenv.config()`, which reads `apps/server/.env` — so a worker's environment
 * is not purely what `vitest.config.ts` handed it. dotenv leaves keys that are already set alone,
 * which means the config's value wins today; this makes that a checked fact rather than a trusted
 * one. The failure it exists to prevent is a test suite quietly truncating the dev database.
 */
if (process.env.DATABASE_URL !== UNIT_DATABASE_URL) {
  throw new Error(
    `Refusing to run: DATABASE_URL is ${process.env.DATABASE_URL ?? 'unset'}, expected the unit database (${UNIT_DATABASE_URL}).`
  );
}

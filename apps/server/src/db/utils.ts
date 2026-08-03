import { type SQL } from 'drizzle-orm';

import { type db } from '@/db';

/**
 * A `db` handle or an open transaction, so a service method can either run on its own or join a
 * caller's transaction — `IngredientsService.resolveByName` running inside a recipe save, say.
 * Methods that accept one default it to `db`.
 */
export type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The conditions a list query accumulates before handing them to `and(...)`.
 *
 * `undefined` is a member because `and()` and `or()` both ignore undefined conditions — that's what
 * lets an optional filter be pushed as-is. Without it the array infers as `SQL[]` from its first
 * element and every `or(...)` push needs a non-null assertion, which is a lie waiting to become true
 * the day one of the arguments turns conditional.
 */
export type Filters = (SQL | undefined)[];

/** Optional text fields come in as '' when a user clears them; store that as NULL. */
export const emptyToNull = (value: string | undefined) => (value === '' ? null : value);

/** Postgres unique-violation SQLSTATE — what any of our `unique()` constraints raises on a duplicate. */
const UNIQUE_VIOLATION = '23505';

/**
 * Identifies the error a duplicate row raises, so a service can answer 409 with a message naming the
 * conflict instead of letting a 500 escape. Kept structural rather than typed against a driver error
 * class: the pg and Neon pools raise different classes carrying the same `code`.
 */
export const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === UNIQUE_VIOLATION;

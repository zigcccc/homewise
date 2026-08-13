import { type SQL } from 'drizzle-orm';

import { type db } from '#db/core';
import { type FieldChange } from '#lib/models';

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

/**
 * Optional text fields come in as '' when a user clears them; store that as NULL.
 *
 * `null` is accepted as well as returned: the payload models derive from the columns, so a nullable
 * one takes an explicit `null` for the same "clear it" the empty string means.
 */
export const emptyToNull = (value: string | null | undefined) => (value === '' ? null : value);

/**
 * Whether a patch has anything for drizzle to write.
 *
 * Every PATCH field is optional, so `PATCH {}` reaches the update with every key undefined — and
 * drizzle throws "No values to set" rather than no-opping, which escapes as a 500. Pass either the
 * `set` object or the validated payload; three services had grown three different spellings of this.
 */
export const writesAnything = (patch: Record<string, unknown>) =>
  Object.values(patch).some((value) => value !== undefined);

/**
 * Whether a replace-all list of sub-rows still says what it said, compared as canonical keys.
 *
 * The counterpart to {@link changedColumns} for the parts of a save that aren't columns — a
 * contact's links, a recipe's ingredients. A form posts its whole list on every save, so without
 * this every save would report the list as changed and no save could ever be a no-op.
 */
export const sameList = (existing: string[], incoming: string[]) =>
  existing.length === incoming.length && existing.every((value, index) => value === incoming[index]);

/**
 * Columns the activity log names but never quotes. An identity number is something a household
 * member can look up on the record itself; it is not something to leave a permanent copy of in a
 * feed, least of all the copy that was replaced.
 */
const OPAQUE_COLUMNS = new Set(['medicalIdNumber', 'nationalId', 'taxId']);

/** Anything a patch can put in a column. Everything else is nulled rather than logged as a shape. */
const readableValue = (value: unknown): FieldChange['from'] => {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  // Timestamps a patch drives from a toggle — `paidBackAt` off `paidBack`. The web reads the date.
  return value instanceof Date ? value.toISOString() : null;
};

/**
 * Which columns a patch actually changes, and what it changes them between — the "what" behind an
 * activity line, so a member reads "birthday 03. 07. 2019 → 04. 07. 2019" rather than "6 updates".
 *
 * Compares the **normalized** `set` object against the stored row, never the raw payload: a form
 * posts `''` where the column holds NULL, so diffing before `emptyToNull` has run reports a change on
 * every save of every optional field. Keys the patch leaves `undefined` are not being written and are
 * not looked at.
 *
 * A foreign key keeps its name and loses its values — "location" says something, "location 3 → 7"
 * does not — as does anything in {@link OPAQUE_COLUMNS}. Anything that isn't a column (a recipe's
 * ingredients, a contact's links) has no diff to take and is named by the service instead.
 */
export const changedColumns = (existing: Record<string, unknown>, patch: Record<string, unknown>): FieldChange[] =>
  Object.entries(patch).flatMap(([field, value]) => {
    if (value === undefined || Object.is(existing[field], value)) {
      return [];
    }

    return field.endsWith('Id') || OPAQUE_COLUMNS.has(field)
      ? [{ field }]
      : [{ field, from: readableValue(existing[field]), to: readableValue(value) }];
  });

/** Postgres unique-violation SQLSTATE — what any of our `unique()` constraints raises on a duplicate. */
const UNIQUE_VIOLATION = '23505';

/**
 * Identifies the error a duplicate row raises, so a service can answer 409 with a message naming the
 * conflict instead of letting a 500 escape. Kept structural rather than typed against a driver error
 * class: the pg and Neon pools raise different classes carrying the same `code`.
 *
 * Walks `cause`, because drizzle wraps driver errors in a `DrizzleQueryError` that carries no `code`
 * of its own. Checking only the top level silently answered `false` for every duplicate — invisible
 * until two writes actually raced, since each service pre-checks the name and rarely reaches here.
 */
export const isUniqueViolation = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  if ('code' in error && error.code === UNIQUE_VIOLATION) {
    return true;
  }

  return 'cause' in error && isUniqueViolation(error.cause);
};

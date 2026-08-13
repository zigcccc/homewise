import { and, count, type SQL } from 'drizzle-orm';
import { type PgTable } from 'drizzle-orm/pg-core';

import { db } from '#db/core';
import { type FieldChange, type PagedParams } from '#lib/models';

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
 * One numbered page of a list: the rows, and how many there are in total to page through.
 *
 * The count is a second query because the read is a drizzle *relational* one (`findMany` with
 * `with:`), which no aggregate can hang off. Both run against the same `filters`, in parallel.
 *
 * The returned `page` may not be the one asked for — an offset past the end re-reads at the last
 * real page. Callers render the pager from it, never from the URL that asked.
 */
export async function readPagedList<Row>({
  filters = [],
  page,
  pageSize,
  read,
  table,
}: PagedParams & {
  filters?: Filters;
  table: PgTable;
  read: (query: { limit: number; offset: number; where: SQL | undefined }) => Promise<Row[]>;
}) {
  const where = and(...filters);
  const [rows, [totals]] = await Promise.all([
    read({ limit: pageSize, offset: (page - 1) * pageSize, where }),
    db.select({ total: count() }).from(table).where(where),
  ]);

  const total = totals?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  if (rows.length === 0 && page > lastPage) {
    return {
      items: await read({ limit: pageSize, offset: (lastPage - 1) * pageSize, where }),
      page: lastPage,
      pageSize,
      total,
    };
  }

  return { items: rows, page, pageSize, total };
}

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

  return value instanceof Date ? value.toISOString() : null;
};

/** `Object.is`, except two `Date`s holding the same moment are one value rather than two objects. */
const sameValue = (existing: unknown, incoming: unknown) =>
  existing instanceof Date && incoming instanceof Date
    ? existing.getTime() === incoming.getTime()
    : Object.is(existing, incoming);

/**
 * Which columns a patch changes, and what between — the "what" behind an activity line.
 *
 * Takes the **normalized** `set`, never the raw payload: a form posts `''` where the column holds
 * NULL, so diffing before `emptyToNull` calls every save of every optional field a change.
 *
 * A foreign key and anything in {@link OPAQUE_COLUMNS} keep their name and lose their values.
 */
export const changedColumns = (existing: Record<string, unknown>, patch: Record<string, unknown>): FieldChange[] =>
  Object.entries(patch).flatMap(([field, value]) => {
    if (value === undefined || sameValue(existing[field], value)) {
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

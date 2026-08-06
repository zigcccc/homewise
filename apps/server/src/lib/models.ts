import z from 'zod';

/**
 * A free-text optional field: trims, caps the length with a message that names the field, and accepts
 * an empty string as "cleared" — blanking an input sends `''`, which the service normalizes to NULL
 * via `emptyToNull`. Omitting the key entirely leaves the stored value untouched.
 */
export const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, { error: `${label} must contain at most ${max} characters` })
    .or(z.literal(''))
    .optional();

/**
 * The columns a payload never gets to set: the row's identity and timestamps belong to the DB, and
 * the household comes from `withHousehold`, not from whoever is asking.
 *
 * Spelled once and `.omit()`ed from every `createInsertSchema`/`createUpdateSchema`, so a new
 * household-scoped table can't accidentally accept an `id` or a `householdId` off the wire.
 *
 * Three ways to say what a field takes, and the difference is not cosmetic:
 *
 * - **A refinement callback** (`name: (model) => model.min(1)`, or `recordedAt: () => z.iso.date()`
 *   when the generated schema is the wrong type outright) keeps drizzle-zod's own wrappers. Use it
 *   whenever the payload's shape matches the column's.
 * - **`.partial({ field: true })`** for a nullable column the payload may omit. A nullable column
 *   with no default comes out **required-but-nullable** — `POST` would refuse a body that simply
 *   didn't mention it.
 * - **`.extend({ field: … })`** when the payload deliberately differs from the column. Optional text
 *   is the standing case: the API's "cleared" is `''` (see `optionalText`) and the column's is NULL,
 *   and a `| null` leaking out here reaches a react-hook-form field that cannot hold one.
 *
 * Never hand a refinement a **bare schema** — that replaces the generated one *including* its
 * wrappers, so every field of a `createUpdateSchema` silently becomes required. A PATCH model that
 * demands every key type-checks perfectly and fails on the first partial update.
 */
export const dbOwnedColumns = { createdAt: true, householdId: true, id: true, updatedAt: true } as const;

/**
 * The `?search=` every list endpoint takes: a case-insensitive substring, trimmed, with an empty
 * string meaning "no filter" rather than "match the empty string".
 *
 * `.catch(undefined)` is what keeps a malformed query string from 400ing a page — a list param
 * degrades to its default instead of refusing to render.
 */
export const searchQueryParam = z
  .string()
  .trim()
  .transform((value) => (value === '' ? undefined : value))
  .optional()
  .catch(undefined);

/** Which way a list is sorted. Nothing about this is per-entity — only the sort *key* is. */
export const sortDirection = z.enum(['asc', 'desc']);
export type SortDirection = z.infer<typeof sortDirection>;

/** A `date` column a form can blank. `''` is "cleared", which the service normalizes to NULL. */
export const clearableDate = z.iso.date({ error: 'Use a valid date' }).or(z.literal(''));

/**
 * The two halves of a managed image field, as multipart sends them (see `ImagesService`).
 *
 * `image` is either an uploaded photo or `''` to clear; `avatar` uploads-or-reuses a shared blob and
 * its **filename is the dedup key**, which is why it's constrained to a safe `<slug>.<ext>` — a
 * slash or a second dot could escape `avatars/` or overwrite somebody else's blob.
 */
export const profileImage = z.union([z.file(), z.string()]).optional();

export const avatarFile = z
  .file()
  .mime(['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp'], { error: 'Avatar must be an image' })
  .max(1024 * 1024, { error: 'Avatar must be under 1MB' })
  .refine((file) => /^[a-z0-9-]+\.[a-z0-9]+$/.test(file.name), { error: 'Invalid avatar' })
  .optional();

/**
 * A money amount as the API speaks it: major units, positive, at most two decimals.
 *
 * The decimals are checked with `toFixed` rather than `.multipleOf(0.01)` — 0.01 has no exact binary
 * representation, so the modulo check rejects perfectly ordinary values like 8.29.
 *
 * And refused rather than rounded: the column behind this is `numeric(12,2)`, which would quietly turn
 * 1.005 into 1.01 and never mention it. The ceiling is that column's, too.
 */
export const moneyAmount = (label: string) =>
  z
    .number({ error: `${label} must be a number` })
    .positive({ error: `${label} must be more than 0` })
    .max(9_999_999_999.99, { error: `${label} is too large` })
    .refine((value) => Number(value.toFixed(2)) === value, {
      error: `${label} can have at most 2 decimal places`,
    });

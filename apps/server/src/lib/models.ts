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

/**
 * One column a save actually changed, as the activity log carries it.
 *
 * `from`/`to` are optional rather than nullable, and the difference matters: `null` is a value a
 * column can hold (cleared), while an absent key means "this changed, but there is nothing worth
 * showing" — a foreign key, whose value is an id nobody can read, or a relation that isn't a column
 * at all. The line then names the field and stops.
 *
 * Values are stored raw and formatted for reading on the web, so a date stays a date rather than
 * becoming one locale's idea of one on its way into the database.
 */
const columnValue = z.union([z.string(), z.number(), z.boolean()]).nullable();

export const fieldChangeModel = z.object({
  field: z.string(),
  from: columnValue.optional(),
  to: columnValue.optional(),
});
export type FieldChange = z.infer<typeof fieldChangeModel>;

/** Which way a list is sorted. Nothing about this is per-entity — only the sort *key* is. */
export const sortDirection = z.enum(['asc', 'desc']);
export type SortDirection = z.infer<typeof sortDirection>;

/** The page size no caller may exceed, whatever it asks for. */
export const MAX_PAGE_SIZE = 100;

/**
 * The `?cursor=&limit=` half of a **feed**, to `.extend()` onto that endpoint's filters.
 *
 * `cursor` is the id of the last row already shown, and the ordering has to agree with it
 * (`desc(id)`) — that is what makes "older than the last one shown" a complete condition. Rows
 * written mid-scroll shift every offset after them, so an offset feed shows one page's last row
 * again at the top of the next; a cursor cannot.
 *
 * The trade-off is that a cursor only ever walks forward, so it can answer "what follows this row"
 * and nothing else. A list the reader jumps around in wants {@link pagedQueryParams} instead.
 */
export const cursorQueryParams = (defaultSize: number) =>
  z.object({
    cursor: z.coerce.number<number>().int().positive().optional().catch(undefined),
    limit: z.coerce.number<number>().int().min(1).max(MAX_PAGE_SIZE).default(defaultSize).catch(defaultSize),
  });
export type CursorParams = z.infer<ReturnType<typeof cursorQueryParams>>;

/** The page a numbered list opens on, and how many rows it holds. */
export const DEFAULT_PAGE_SIZE = 25;

/** What the rows-per-page picker offers. Not a constraint on `pageSize` — a URL may ask for any. */
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

/**
 * The `?page=&pageSize=` half of a **numbered** list, to spread onto that endpoint's filters.
 *
 * An offset, deliberately, where {@link cursorQueryParams} refuses one: a pager whose whole point is
 * jumping to page 7 has to be able to count pages, which a cursor cannot do. The cost is the one
 * every numbered pager pays — a row inserted while you read shifts the ones after it — and it is
 * bounded by the ordering being stable, so every paginated list ends its `orderBy` with its id.
 *
 * The web spreads this same shape into the route's `validateSearch`, so the URL and the endpoint
 * cannot drift.
 */
export const pagedQueryParams = z.object({
  page: z.coerce.number<number>().int().min(1).default(1).catch(1),
  pageSize: z.coerce
    .number<number>()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE)
    .catch(DEFAULT_PAGE_SIZE),
});
export type PagedParams = z.infer<typeof pagedQueryParams>;

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
 * The decimals are checked with `toFixed`, which says "at most two" directly. Do not rewrite it as a
 * hand-rolled `value % 0.01`: 0.01 has no exact binary representation, so that refuses perfectly
 * ordinary prices — `8.29 % 0.01` is 0.00999…, not 0. (Zod's own `.multipleOf` is decimal-aware and
 * gets this right; the trap is only in doing the modulo yourself.)
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

/**
 * A map pin, as two halves. Both are optional and `null` clears them.
 *
 * Only the ranges live here. "Both or neither" cannot: a PATCH may legitimately carry one half, and
 * whether that leaves a valid pin depends on what is already stored — so the service decides it
 * against the merged row, and the column that holds it carries a check constraint of its own.
 */
export const coordinates = {
  latitude: z
    .number()
    .min(-90, { error: 'Latitude must be between -90 and 90' })
    .max(90, { error: 'Latitude must be between -90 and 90' })
    .nullable()
    .optional(),
  longitude: z
    .number()
    .min(-180, { error: 'Longitude must be between -180 and 180' })
    .max(180, { error: 'Longitude must be between -180 and 180' })
    .nullable()
    .optional(),
};

---
name: server-conventions
description: Conventions for apps/server — the flat <feature>.app/.service/.model module layout, shared #lib helpers, withHousehold scoping, the service quality bar, deriving Zod models from the Drizzle schema with drizzle-zod, and list/detail API shape. Use when writing or reviewing any server module, service, route, Zod model or endpoint.
---

# Server conventions

Hono.js app with a module-based structure. Read `CLAUDE.md` first — it wins on any conflict; this
skill is the detail behind its server tripwires.

## Module layout

Each feature module lives in `src/modules/<feature>/` and is **flat** — no sub-folders:

- `<feature>.app.ts` — Hono router with route definitions
- `<feature>.service.ts` — Business logic and DB queries
- `<feature>.model.ts` — Zod schemas and TypeScript types
- `<feature>.constants.ts` — *optional*: domain lookup tables and fixed values. A `Record` mapping
  one enum onto another is not a schema and does not belong beside them — `contacts.constants.ts`
  holds `INVERSE_ROLE`. Only add the file when there is something to put in it.
- `index.ts` — one line, `export { default } from './<feature>.app'`, so `src/index.ts` can mount it
  as `./modules/<feature>`

Barrels earn their place only there. That `index.ts` is the **one** sanctioned folder-barrel on the
server, and it works because `src/index.ts` reaches it with a relative directory import that esbuild
resolves — not through the `#imports` map, which does no directory resolution at all. Every other
specifier names its file. See `server-build-and-imports`.

Middleware chain: Logger → CORS → Auth session guard → Routes.

Request validation uses a custom Zod validator wrapper in `src/lib/validation.ts`. The `AppContext`
type (`src/types/app.type.ts`) carries `user` and `session` in Hono's context variables.

Auth is handled by **better-auth** (`src/lib/auth.ts`), using the Drizzle adapter and Resend for
transactional email. Environment variables are validated at startup via `src/config/env.ts` — add new
vars there, and read them through `env`, never off `process.env`.

## Shared helpers

`src/lib/` holds the pure, domain-free helpers every module may reach for: `models.ts`, `dates.ts`,
`validation.ts`. `src/db/utils.ts` holds the DB-scoped ones (`Executor`, `emptyToNull`,
`isUniqueViolation`).

- **`models.ts`** is the shared Zod vocabulary: `optionalText`, `moneyAmount`, `clearableDate`,
  `profileImage`/`avatarFile`, and the list params every endpoint takes — `searchQueryParam` and
  `sortDirection`. Only the sort *key* is per-entity. It is exported to the web as
  `@homewise/server/models`, so a route's `validateSearch` uses the same `searchQueryParam` the
  endpoint validates against rather than a copy that agrees today.
- **`permissions.ts`** is the role/area vocabulary, exported to the web as
  `@homewise/server/permissions` so the middleware and the UI gate on one definition. It imports
  `HouseholdMemberRole` from the households model, which stretches "domain-free" — the justification is
  that it is vocabulary *every* module speaks, it touches neither the DB nor Hono, and putting it in a
  feature module would have every other module import that module. Roles come from the pg enum via
  drizzle-zod, so adding one is a compile error at `ROLE_POLICIES` and nowhere else.
- **`dates.ts`** is `YYYY-MM-DD` calendar arithmetic in UTC, over **date-fns anchored to
  `@date-fns/utc`'s `UTCDate`**. That anchor is the whole point: date-fns reads calendar fields off
  whatever date it's handed, so a plain `Date` would do the maths in the process's timezone. Never
  hand-roll this — string splicing and `setUTCDate` walks were what it replaced. `clampRange(from,
  to, maxDays)` lives here too, shared by every ranged read; each caller still decides its own start
  and default length.

## Household scoping

Household-scoped routes mount `withHousehold('<area>')` (`src/middleware/household.middleware.ts`),
which resolves the caller's household **and their role** once, and exposes them as a non-nullable
`c.var.household` and `c.var.viewer`. Compose `withHouseholdOwner` on top for owner-only actions
(403 when not the owner).

**The area argument is the permission system.** It is required because this is the middleware every
household-scoped app already mounts, so there is no "forgot to add the guard" state to be in — and
read-vs-write is derived from the HTTP method (`GET`/`HEAD` read, everything else write), so one
mount covers a whole sub-app and **no route carries a permission decoration of its own**.

- **A new module adds one entry to `PERMISSION_AREAS`** (`src/lib/permissions.ts`) and passes it here.
  Nothing else. `app.route-coverage.test.ts` fails by name if a mounted app skips it.
- **There is no per-route override list, on purpose.** Where the method heuristic misfits, reshape the
  route instead: `/realtime/auth` is a `GET` because minting a subscribe token is a read, and
  `/households/my` splits into record / members / invites sub-apps because its `GET`s need different
  areas. Both are cheaper than an override mechanism nobody can grep for.
- **`.route()` flattens a sub-app's middleware into its parent**, so two sub-apps mounted at the same
  prefix would each run on every request under it — resolving the household twice and flushing an
  empty event buffer. Where a sub-app must own an exact path, mount its middleware as `.use('/', mw)`;
  Hono appends no wildcard, so it matches that path only.
- Mount it **per sub-app, never globally** — routes that must work without a household (creating one,
  reading/accepting an invite, `/users`) stay outside it. See how `households.app.ts` splits `/my/*`
  into its own sub-app.
- Service methods take a `householdId: number`, never a `userId`. Authorization lives in the routing
  layer; services are pure household operations. Scope every query by `householdId` so ids from other
  households 404 rather than leak.
- Services must not import Hono types. If a service needs request headers, take `headers: Headers` —
  a `Context` typed to the narrow env isn't assignable from the widened one.

`withHousehold` also owns realtime dispatch via `c.var.emit(...)`. **Every mutating handler under it
must emit** — see `realtime-events`.

## Services are the cornerstone — hold them to it

Business logic lives in services, so they get the strictest reading of any file in the repo. Before
finishing one, re-read it against `recipes.service.ts` / `ingredients.service.ts` and check all of:

- **Nothing generic in a feature module.** If a helper has nothing domain-specific in it — date
  arithmetic, string shaping, clamping — it belongs in `src/lib/`, not beside the feature that
  happened to need it first. Date maths in particular is already there: import from `#lib/dates`,
  never re-derive `startOfISOWeek`/`addDays` locally (that mistake shipped once *and* got
  copy-pasted into `db/seed.ts`).
- **No dead parameters.** `executor: Executor = db` is only warranted when a transaction genuinely
  reaches that method. The `read*Row` helpers take one because mutations call them inside a `tx`; the
  `read*WithRelations` ones do not.
- **No explicit return types, no hand-written response shapes.** The RPC contract is *derived* from
  inference, so a second hand-written source of truth can silently disagree with it. See below.
- **Copying a sibling module copies its warts.** Read siblings for the *pattern*, not to paste. When
  you do spot a smell, grep for it — it is almost never in only the file you're looking at.
- **Comment the live constraint, not the archaeology.** A comment earns its place by explaining
  something still true and non-obvious (why a day's rows are renumbered before the source day is
  closed). One that narrates how the code got here — a bug that no longer exists, a type that was
  removed — is noise the next reader has to disprove.

### Let the server infer its return types

No `): Promise<Foo>` on a service method, and no hand-written type for the shape it returns. The RPC
contract *is* the inferred type, so a hand-written one is a second source of truth that can disagree
with the code silently. Hand-writing a row shape as a function's *input* is fine and precedented
(`MemberWithUser`, `MedicalInfoRow`, `PlannedMealRow`).

- **When inference looks broken, the annotation is treating a symptom.** `members` once came out as
  `any` on the web; the cause was response *nesting depth* (`days[].meals[].members[]`, three arrays
  deep), and flattening the response fixed it and made every annotation removable. Deep nesting is
  the thing to suspect first.
- **`pnpm check-types` cannot detect this** — `any` is assignable to everything, so a collapsed type
  passes silently. Prove it with a throwaway probe that forces the compiler to speak:
  `export const bad: number = a.meals[0]!.members[0]!.displayName;` **must** error. If it compiles,
  the type is `any`.

## Models derive from the schema

**The DB is the source of truth for what a payload contains.** A create/patch model that writes a row
is built with drizzle-zod's `createInsertSchema`/`createUpdateSchema` over the table, and every
`pgEnum` is mirrored with `createSelectSchema(schema.xEnum)` rather than a hand-written
`z.enum([...])`. Adding or dropping a column is then a compile error somewhere, not a copy that
silently disagrees — the hand-mirrored enums in particular meant adding a DB value left the API
rejecting it.

Three things about drizzle-zod's shape, all of which have already cost time — the rule is written
above `dbOwnedColumns` in `#lib/models`:

- **Refine with the callback form, never a bare schema.** `name: (model) => model.min(1)`, or
  `recordedAt: () => z.iso.date()` when the generated schema is the wrong type outright. A bare
  schema replaces the generated one *including its wrappers*, so a nullable column stops taking
  `null` and — the one that bites — every field of a `createUpdateSchema` becomes **required**. A
  PATCH model that demands every key type-checks perfectly and fails on the first partial update.
- **A nullable column with no default comes out required-but-nullable** on an insert schema.
  `.partial({ field: true })` is what makes it omittable.
- **`.extend()` where the payload deliberately differs from the column.** Optional text is the
  standing case: the API's "cleared" is `''` (see `optionalText`), the column's is NULL, and a
  `| null` leaking out reaches a react-hook-form field that cannot hold one. Same for keys that
  aren't columns at all — `categoryName`/`storeName` (found-or-created), `image`/`avatar` (resolved
  to a blob URL), a recipe's nested `ingredients`.

**`.omit(dbOwnedColumns)` on every one.** Ids and timestamps belong to the DB and `householdId` comes
from `withHousehold`, never from the payload. Spell out any further server-owned columns beside it
(`currency` copied off the household, `paidBackAt` driven by a `paidBack` toggle, `createdBy` off the
session).

**What stays hand-written: a payload that is a *command over* a row rather than the row.** `checked`
drives a stored `checkedAt`/`checkedBy` pair, `position` drives a resequence, `memberIds` is a join
table — deriving those means overriding every field to get nothing back. The shopping-list item and
planned-meal models say so in a comment; don't "fix" them.

Also derived from the column, so don't restate it: nullability and enum values. **Not** derived, so
you must state it:

- A `date` column generates a bare `z.string()` — it accepts `2026-13-45` and `nope` alike. Use
  `z.iso.date()`, or `clearableDate` where a form can blank it.
- A `numeric` column generates a **string** schema unless it's declared `mode: 'number'` (ours are,
  so it's a `z.number()` carrying the precision range and nothing else). Either way there is no
  decimal-places check and no positivity check, so money always keeps an explicit `moneyAmount(...)`
  — the one that matters is the 2-decimal rule, which is `toFixed`-based rather than
  `.multipleOf(0.01)` because 0.01 has no exact binary representation and would reject 8.29.

Path params use `z.coerce.number<number>()`.

## API shape

- **A collection that can grow unbounded gets its own list endpoint** (`GET /:id/entries`), carrying
  `search`, `sortKey`, `sortDirection` and any filters as query params. Don't nest a full collection
  inside its parent's detail response — the detail endpoint returns metadata plus a **count**
  (`entryCount`), so filtering a list never refetches parent metadata.
- **There is exactly one pagination concept: an offset.** The model spreads `...pagedQueryParams().shape`
  onto its filters; the service hands its `filters`, the `page`/`pageSize` and its table to
  `readPagedList` (`#db/utils`), which answers `{ items, page, pageSize, total }`. Pass a size to the
  factory where a list wants its own default (`pagedQueryParams(20)` for the activity feed).

  **Do not add a keyset cursor back.** One was tried and removed: an offset serves both a numbered
  pager *and* an infinite scroll, where a cursor can only serve the second — it has no notion of "the
  7th page" without walking there, so it cannot number pages, jump, or offer a last page. Two
  mechanisms also meant two response shapes and the question of which one a new endpoint should pick.

  The `page` that comes back may not be the one asked for: an offset past the end re-reads at the
  last real page, so the web renders its bar from the **response**, never from the URL.

  **A feed that grows at the head freezes itself with a filter, not with a second mechanism.**
  `activity` is the only such list — every mutation in the household writes a line — and an offset
  counting from a moving top would repeat a row across a page boundary. It takes a `maxId`: the
  newest id the reader has already seen, applied as `lte(columns.id, maxId)` beside `search` and
  `entity`. It narrows *which* rows; `page` still says which slice. The web sends it from the second
  page onward (see `activity.queries.ts`), and never on the first — which is what lets an
  invalidation pick up new rows and re-anchor instead of staying pinned to a stale id.

  **Every paginated `orderBy` ends with its `id`**, in the sort's own direction. Rows tied on the sort
  key are otherwise free to come back in a different order per query, which drops one between two
  pages and shows another twice. It is not unit-testable — Postgres is consistent enough at any size
  a test can build — so it is a rule, commented at each `orderBy`, not a covered case.

  **A picker pages too.** A combobox over API entities gets its own
  `list<X>OptionsInfiniteQueryOptions(search)` on the web — one page at a time, searched on the
  server, keyed under `['<domain>', 'options', …]`. Asking for `MAX_PAGE_SIZE` instead is a silent
  ceiling: `pageSize` is capped at 100, so row 101 of a household's ingredients could not be picked
  however precisely you typed its name.

  Two things this rests on. A picker that creates ("Create *Lidl*") decides that from the loaded
  pages, which is only exact because these endpoints sort by **name ascending** — a match sorts
  before anything extending it — so **don't pass a sort to a picker that creates**. And a control
  with nowhere to put a search box or a sentinel (a plain `Select`, a dropdown submenu) still takes
  the whole capped list; `listStoreOptionsQueryOptions` is that case, and is named apart from the
  infinite one on purpose.
- Sort params use a **Zod enum mapped onto a Drizzle column** — never string-interpolate a column
  name. Give every list param `.default(...).catch(...)` so a malformed query string degrades to sane
  defaults instead of a 400. `search` and `sortDirection` come from `#lib/models`; only the sort key
  is per-entity.
- Name relations for **what they are**, not their table. A dictionary's `child` (who it's for) and an
  entry's `creator` (who added it) are both `household_member`/`user` joins — `member` for either
  would be ambiguous. Mutations return the same joined shape as reads, so a created row and a
  refetched one aren't different types.
- Dates use `z.iso.date()` — never a hand-rolled `YYYY-MM-DD` regex, and never the bare `z.string()`
  drizzle-zod generates for a `date` column; both accept `2026-13-45`. Optional dates a form can
  clear are `clearableDate.optional()` (`#lib/models`), normalized to `null` in the service.

## Related skills

`server-build-and-imports` for `#imports`, exports and the build · `realtime-events` for `c.var.emit`
· `working-with-images-on-server` for blob-URL columns · `new-feature-module` for the end-to-end
build order · `unit-testing` for what in a service earns a test.

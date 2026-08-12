---
name: new-feature-module
description: Scaffold a new Homewise feature end-to-end — Drizzle schema, Zod models, household-scoped Hono service and routes, migration, TanStack Query module, list/detail routes, and sidebar entry. Use when adding a new household-scoped domain (shopping lists, recipes, meal plans, storage locations, expenses) or when asked to "build the X feature" / wire up a stubbed sidebar link.
---

# New feature module

Builds a household-scoped feature across `apps/server` and `apps/web` in the order that keeps the type
contract green at every step. Read `CLAUDE.md` first — this skill is the procedure, CLAUDE.md is the
conventions, and it wins on any conflict.

## Before writing code

Settle these with the user; each one changes the schema and is expensive to retrofit:

1. **Ownership** — is the resource scoped to the household, or to a member within it?
2. **Permissions** — fully collaborative (any member), or owner-only for some actions? Homewise
   defaults to collaborative for content, owner-only for destructive/structural changes.
3. **Collection size** — can the child collection grow unbounded? If yes it needs its own list
   endpoint with search/sort (see CLAUDE.md → API shape), not nesting in the parent's detail response.
4. **Soft delete** — is there an "archive" concept, or only hard delete?

Then confirm the plan. Don't infer these from the feature name.

## Server

Work in `apps/server/src/`. Each step should leave `pnpm check-types` green.

**1. Schema** — `db/schema/<feature>.ts`

Spread `baseDbEntityFields` for `id`/`createdAt`/`updatedAt`. FK to `household.id` (and
`householdMember.id` where the resource belongs to a person) with `onDelete: 'cascade'`; user
attribution FKs use `onDelete: 'set null'` so content survives account deletion. Add a `unique()`
constraint for any "one X per Y" rule — enforce it in the DB, not just in the service.

Name relations for what they are (`child`, `creator`), never `member`. Export from
`db/schema/core.ts` and add the inverse `many()` to `household.ts`.

**2. Models** — `modules/<feature>/<feature>.model.ts`

One flat file beside the app and service, plus a one-line `index.ts` re-exporting the app. No
`models/` folder, no barrel.

Keep it to schemas and the types inferred from them. A domain lookup table — a `Record` mapping one
enum onto another, a set of fixed values — is not a schema and goes in `<feature>.constants.ts`
beside it (see `contacts.constants.ts`), with its own `package.json#exports` subpath if the web needs
it too.

**Derive them from the table.** `createInsertSchema`/`createUpdateSchema` for anything that writes a
row, `createSelectSchema(schema.xEnum)` for every enum — never a hand-written `z.enum([...])` mirror.
`.omit(dbOwnedColumns)` plus whatever else the server owns. See CLAUDE.md → "Models derive from the
schema" for the three drizzle-zod traps before you write one; the callback-vs-bare-schema distinction
in particular produces a PATCH model that type-checks and then rejects every partial update.

Hand-write only a payload that is a *command over* a row rather than the row itself (a boolean that
drives a stored timestamp, a position that triggers a resequence, an array that is a join table), and
say so in a comment.

Trimmed, length-bounded text; `clearableDate` for a date a form can blank; `moneyAmount` for money
(drizzle-zod gives a `numeric` column no decimal or positivity check). `search` and `sortDirection`
come from `#lib/models` — only the sort key is per-entity, and it gets `.default().catch()`. Path
params use `z.coerce.number<number>()`.

Add a `"./<feature>"` subpath to `apps/server/package.json#exports` pointing straight at
`./src/modules/<feature>/<feature>.model.ts`, so the web app imports models the same way it does
`@homewise/server/households`.

**3. Service** — `modules/<feature>/<feature>.service.ts`

Static class. Every method takes `householdId: number` — no auth logic, no Hono imports. Scope every
query by `householdId`; throw `HTTPException(404)` rather than leaking cross-household ids. Reuse
`HouseholdsService.readHouseholdMember` for member validation, and `memberDisplayName` /
`toMemberResponse` for display names. Aggregate queries (counts) must be constrained to the ids just
read, not the whole table. Date arithmetic comes from `#lib/dates` — never re-derive it locally.

Services carry the business logic, so they get the strictest review in the repo. Read a sibling
(`recipes`, `ingredients`) for the *pattern* — then read what you wrote for the things copying
introduces. CLAUDE.md → "Services are the cornerstone" is the checklist: no generic helpers stranded
in the module, no dead `executor` params, no explicit return types or hand-written response shapes,
comments that explain a live constraint rather than how the code got here. A smell you find is
almost never confined to your file — grep before you fix it.

**4. Routes** — `modules/<feature>/<feature>.app.ts` + `index.ts`

`new Hono<AppContext>().use(withHousehold)` then chained handlers reading `c.var.household.id`. Keep
the chain unbroken — `AppType` inference depends on it. Register in `src/index.ts` with `.route()`.

Every mutating handler ends with `c.var.emit(...)` before its `c.json(...)` — one call per distinct
effect, so other members' open tabs refresh. Add the entity to `householdEventEntity`
(`modules/realtime/realtime.model.ts`); the web's `invalidators` record then fails to compile until step 7's
helper is mapped, which is what keeps the two halves in sync.

**5. Migration**

`pnpm db:migrations:create` then `db:migrations:apply`. Read the generated SQL before applying and
confirm it's additive. Never hand-write it.

**6. Verify, then stop**

Boot the server and exercise every route with curl, including negatives: non-owner on an owner-only
route → 403, wrong member role → 400, foreign id → 404, duplicate → 409, malformed body → 400 with
field-level messages. Then report and **ask the user
to commit** before starting the web work.

## Web

Work in `apps/web/src/`.

**7. Query module** — `modules/<feature>/<feature>.queries.ts` + `index.ts`

`queryOptions` helpers wrapped in `parseResponse`. Hierarchical keys (see CLAUDE.md). Export a
`invalidate<Feature>(queryClient, id)` helper alongside them.

Then map the entity from step 4 in the `invalidators` record in
`modules/realtime/components/realtime-provider.tsx`, calling that same helper — that's what makes
another member's tab refresh. It's a `Record` keyed by the server's entity union, so this won't
compile until you do. Mutations still invalidate locally as well; the acting tab skips its own event.

**8. Routes** — `routes/_authenticated/_onboarded/<area>/<feature>/`

`index.tsx` (list) and `$id.tsx` (detail). Both need a loader, a
`pendingComponent: () => <Spinner />` **and an `errorComponent`** — `<RouteError title="…" />` from
`@/modules/shared`; without one a loader rejection replaces the whole app, sidebar included, with the
root boundary's "Something went wrong!".
Filter/sort state goes in `validateSearch` + `loaderDeps`, using `searchQueryParam` from
`@homewise/server/models` rather than a local copy. Table columns and row-action dialogs go in a
co-located `-<feature>.config.tsx`, mirroring `-household-members.config.tsx`; each cell takes the id
it patches and `info.getValue()`, not `info.row.original`.

Derive every payload type from the RPC client, narrowing responses to `, 200`. Forms use
`useForm` + `zodResolver(<server model>)`. Destructive actions use `ConfirmDeleteDialog` from
`@/modules/shared`.

**Read `packages/ui/src/core/index.ts` before writing any markup.** The kit is larger than it looks,
and hand-rolling something it already ships is the fastest way to make this codebase worse — `Tabs`,
`Combobox`/`ComboboxFieldTrigger`, `Empty`, `ButtonGroup`, `InputGroup`, `Badge` and `DataTable` all
exist. Note the `Button` wrapper-span trap in CLAUDE.md → Shared UI before reaching for a `Button` in
a layout that needs `justify-between`.

**Verify the RPC types actually resolved.** `pnpm check-types` passes just as happily when a response
type has collapsed to `any`, because `any` is assignable to everything. Probe one leaf of the new
response per CLAUDE.md → Key Conventions; deeply nested arrays are where it breaks.

Give the empty state real intent: distinguish "nothing here yet" from "nothing matches your filter",
and point at the action that fixes it. Use the **full** `Empty` composition with a default-variant
button inside `EmptyContent` — a one-line `<Empty>` with a ghost button beside it reads as unfinished
next to every other empty state in the app.

A click-to-edit cell is `InlineCell` from `@/modules/shared`, never a fresh copy of the
sizer/placed-editor arrangement. A custom control inside `FormControl` must not declare its own `id`.
Both are in CLAUDE.md, and both have already shipped as bugs.

**9. Sidebar** — add a `SidebarGroup` in `routes/_authenticated/-components/AppSidebar.tsx`, replacing
the stubbed `<Link to="/">` placeholder if one exists.

**10. Static checks**

`pnpm check-types`, then `pnpm lint` to **zero diagnostics**, then `pnpm knip`. All three, before the
E2E gate: knip is the only one that flags a dependency a `package.json` declares but nothing in that
package imports. Type-checking green is not evidence the feature works — that's what the E2E flow
below is for.

**11. E2E flow** — `apps/e2e/`

This is how the feature is verified — **do not hand-drive the browser** (it's slow and error-prone;
that's what these tests replace). Add a Playwright spec covering the feature through the **real UI**:
create → appears in list → edit → search/sort → archive (when supported) → delete, plus the validation
failure path. Put selectors/actions in a Page Object (`apps/e2e/pages/<feature>.page.ts`) and the
assertions in `apps/e2e/tests/<feature>.spec.ts`, mirroring `household-members.page.ts` /
`household-members.spec.ts`. Keep it self-contained — create a uniquely-named row
(`` `... ${Date.now()}` ``) and remove it — so it's idempotent and never mutates the shared seed
fixture. Reuse seeded data from `@homewise/server/seed-fixtures`; never hard-code creds/names.
See CLAUDE.md → End-to-end testing. Every feature ships with one.

If the feature's list is one a second member would sit and watch, extend `realtime.spec.ts` too: two
browser contexts in the same household, one acts, the other asserts **without reloading**.

**12. Final gate** — run the full suite

`pnpm test:e2e` (needs Docker; boots server + web against an isolated test DB on :8766). It must pass
before you report the web work done. Run it **once** here as the final check — not while iterating.

## Working agreement

Never run `git commit`. Stop at each checkpoint — after the server module, after the web UI — report
what's done and what you verified, and ask the user to commit before continuing. The full E2E suite
(`pnpm test:e2e`) is the final gate before the "web done" report — run it once at the end, not
continuously.

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
`db/schema/index.ts` and add the inverse `many()` to `household.ts`.

**2. Models** — `modules/<feature>/models/<feature>.model.ts` + `index.ts` barrel

Zod schemas with trimmed, length-bounded text. Dates use `z.iso.date()`. List query params get
`.default().catch()`. Path params use `z.coerce.number<number>()`.

Add a `"./<feature>"` subpath to `apps/server/package.json#exports` pointing at the barrel, so the web
app imports models the same way it does `@homewise/server/households`.

**3. Service** — `modules/<feature>/<feature>.service.ts`

Static class. Every method takes `householdId: number` — no auth logic, no Hono imports. Scope every
query by `householdId`; throw `HTTPException(404)` rather than leaking cross-household ids. Reuse
`HouseholdsService.readHouseholdMember` for member validation and `toMemberResponse` for display
names. Aggregate queries (counts) must be constrained to the ids just read, not the whole table.

**4. Routes** — `modules/<feature>/<feature>.app.ts` + `index.ts`

`new Hono<AppContext>().use(withHousehold)` then chained handlers reading `c.var.household.id`. Keep
the chain unbroken — `AppType` inference depends on it. Register in `src/index.ts` with `.route()`.

**5. Migration**

`pnpm db:migrations:create` then `db:migrations:apply`. Read the generated SQL before applying and
confirm it's additive. Never hand-write it.

**6. Verify, then stop**

Boot the server and exercise every route with curl, including negatives: wrong role → 400, foreign id
→ 404, duplicate → 409, malformed body → 400 with field-level messages. Then report and **ask the user
to commit** before starting the web work.

## Web

Work in `apps/web/src/`.

**7. Query module** — `modules/<feature>/<feature>.queries.ts` + `index.ts`

`queryOptions` helpers wrapped in `parseResponse`. Hierarchical keys (see CLAUDE.md). Export a
`invalidate<Feature>(queryClient, id)` helper alongside them.

**8. Routes** — `routes/_authenticated/_onboarded/<area>/<feature>/`

`index.tsx` (list) and `$id.tsx` (detail). Both need a loader and a
`pendingComponent: () => <Spinner />`. Filter/sort state goes in `validateSearch` + `loaderDeps`.
Table columns and row-action dialogs go in a co-located `-<feature>.config.tsx`, mirroring
`-household-members.config.tsx`.

Derive every payload type from the RPC client, narrowing responses to `, 200`. Forms use
`useForm` + `zodResolver(<server model>)`. Destructive actions use `ConfirmDeleteDialog` from
`@/modules/shared`.

Give the empty state real intent: distinguish "nothing here yet" from "nothing matches your filter",
and point at the action that fixes it.

**9. Sidebar** — add a `SidebarGroup` in `routes/_authenticated/-components/AppSidebar.tsx`, replacing
the stubbed `<Link to="/">` placeholder if one exists.

**10. Verify in the browser**

`pnpm check-types`, then `pnpm lint` to **zero diagnostics**. Then drive the real UI: create, edit,
search, sort, archive, delete, and the validation failure path. Type-checking green is not evidence
the feature works. Clean up test data; never touch rows the user created.

## Working agreement

Never run `git commit`. Stop at each checkpoint — after the server module, after the web UI — report
what's done and what you verified, and ask the user to commit before continuing.

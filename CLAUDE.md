# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Homewise is a household management app — a TypeScript monorepo using **Turbo** for task orchestration and **pnpm** as the package manager.

```
apps/
  server/   # Hono.js REST API
  web/      # React + TanStack Router SPA
packages/
  ui/              # Shared ShadCN component library
  typescript-config/ # Shared TS configs
migrations/        # Drizzle migration files
```

## Commands

```bash
# Development
pnpm dev                        # Run all apps in parallel
pnpm dev --filter @homewise/server  # Run server only
pnpm dev --filter @homewise/web     # Run web only

# Building
pnpm build                      # Build all apps
pnpm check-types                # TypeScript type check all packages

# Linting & formatting (Biome)
pnpm lint                       # Biome check (lint + format diagnostics)
pnpm format                     # Biome check --write (apply lint + format fixes)
pnpm knip                       # Find unused files, exports, and dependencies

# Database (run from apps/server or root)
pnpm db:up                      # Start PostgreSQL via Docker
pnpm db:migrations:create       # Generate migration from schema changes
pnpm db:migrations:apply        # Apply pending migrations
pnpm db:studio                  # Open Drizzle Studio GUI

# Email previews
cd apps/server && pnpm emails:preview   # Preview React Email templates on :4000

# E2E testing (Playwright — apps/e2e)
pnpm test:e2e                              # Full suite. Local: boots server + web + an isolated test Postgres (:8766), migrates + reset-seeds it, removes it after.
pnpm --filter @homewise/e2e test:ui        # Interactive Playwright UI (watch/debug)
pnpm --filter @homewise/e2e test:report    # Open the last HTML report
pnpm --filter @homewise/e2e db:test:up     # Start only the test Postgres (:8766)
pnpm --filter @homewise/e2e db:test:down   # Remove the test Postgres
# No unit-test runner is configured yet — Playwright E2E is the only test layer.
```

Requires Node.js >=24 and Docker (local dev Postgres on 8765; the E2E suite spins up its own throwaway Postgres on 8766).

## Architecture

### Backend (`apps/server`)

Hono.js app with a module-based structure. Each feature module lives in `src/modules/<feature>/` and is a **flat trio** — no sub-folders:
- `<feature>.app.ts` — Hono router with route definitions
- `<feature>.service.ts` — Business logic and DB queries
- `<feature>.model.ts` — Zod schemas and TypeScript types
- `index.ts` — one line, `export { default } from './<feature>.app'`, so `src/index.ts` can mount it as `./modules/<feature>`

Barrels earn their place only there. Everything else names its file — see the imports section below.

Middleware chain: Logger → CORS → Auth session guard → Routes.

Request validation uses a custom Zod validator wrapper in `src/lib/validation.ts`. The `AppContext` type (`src/types/app.type.ts`) carries `user` and `session` in Hono's context variables.

Auth is handled by **better-auth** (`src/lib/auth.ts`), using the Drizzle adapter and Resend for transactional email.

`src/lib/` holds the pure, domain-free helpers every module may reach for: `models.ts`, `dates.ts`, `validation.ts`. `src/db/utils.ts` holds the DB-scoped ones (`Executor`, `emptyToNull`, `isUniqueViolation`).

- **`models.ts`** is the shared Zod vocabulary: `optionalText`, `moneyAmount`, `clearableDate`, `profileImage`/`avatarFile`, and the list params every endpoint takes — `searchQueryParam` and `sortDirection`. Only the sort *key* is per-entity. It is exported to the web as `@homewise/server/models`, so a route's `validateSearch` uses the same `searchQueryParam` the endpoint validates against rather than a copy that agrees today.
- **`dates.ts`** is `YYYY-MM-DD` calendar arithmetic in UTC, over **date-fns anchored to `@date-fns/utc`'s `UTCDate`**. That anchor is the whole point: date-fns reads calendar fields off whatever date it's handed, so a plain `Date` would do the maths in the process's timezone. Never hand-roll this — string splicing and `setUTCDate` walks were what it replaced. `clampRange(from, to, maxDays)` lives here too, shared by every ranged read; each caller still decides its own start and default length.

#### Imports: `#subpaths`, not tsconfig `paths`

The server's non-relative imports are Node's own `package.json#imports` (`#lib/dates`, `#db/schema/core`) — **not** `@/*` path aliases like the web's. Don't "fix" this by adding `paths` back, and don't carry the web's barrel convention across: `apps/web` keeps `modules/<domain>/<mechanism>/index.ts` because `@/*` still resolves a folder, and the server deliberately does not.

- **Every specifier names a file.** Node does no directory resolution and, unlike `tsc`, will not fall through an array of fallback targets — so there is no folder-barrel to import: `#db/core`, `#db/schema/core`, `#modules/ingredients/ingredients.model`. An `index.ts` that only re-exports one sibling is a file and a hop for nothing; an `index.ts` that genuinely defines something (the db client, the schema barrel over 11 files) is named `core.ts` instead. `src/index.ts` is the exception and must keep its name — it is the Vercel Hono entrypoint.
- **Adding a top-level directory under `src/` means adding a line to the `imports` map.** It is one wildcard per directory and stays that size.
- **This is what lets the server ship no declarations.** The web resolves `@homewise/server` to *source*, and `#imports` resolve from the server's own package.json whichever project is compiling — so `apps/web/tsconfig.json` needs no `references`, the server needs no `composite`, and with declaration emit off, `TS7056` and the zod `$strip` portability error cannot occur. `paths` would re-impose the whole chain, and Vercel's Node runtime documents support for neither path mappings nor project references.
- **`tsc` never emits here — esbuild does.** `build` bundles `src/index.ts` to `dist/index.js` (`--packages=external`, so only npm deps stay unresolved), and `tsc` runs solely as `--noEmit`. The bundler is what turns `#imports`, the `.tsx` email templates and the extensionless directory imports into something Node can run.
- **`vercel.json`'s `outputDirectory: dist` is load-bearing — never drop it.** `@vercel/hono` only searches the output directory for its entrypoint when that is set; otherwise it globs the project root, finds `src/index.ts`, and hands a `.ts` entrypoint to `@vercel/node`'s vendored ts-node. That drives the **TypeScript 5** compiler API, so on this repo's TypeScript 7 — whose npm package exports just `{ version, versionMajorMinor }` — the build dies on `ts.sys.readFile`. Pinning an older TypeScript wouldn't rescue it either: that path transpiles per file and never rewrites specifiers, so `./modules/users` would resolve to nothing at runtime.

#### Services are the cornerstone — hold them to it

Business logic lives in services, so they get the strictest reading of any file in the repo. Before finishing one, re-read it against `recipes.service.ts` / `ingredients.service.ts` and check all of:

- **Nothing generic in a feature module.** If a helper has nothing domain-specific in it — date arithmetic, string shaping, clamping — it belongs in `src/lib/`, not beside the feature that happened to need it first. Date maths in particular is already there: import from `#lib/dates`, never re-derive `startOfISOWeek`/`addDays` locally (that mistake shipped once *and* got copy-pasted into `db/seed.ts`).
- **No dead parameters.** `executor: Executor = db` is only warranted when a transaction genuinely reaches that method. The `read*Row` helpers take one because mutations call them inside a `tx`; the `read*WithRelations` ones do not.
- **No explicit return types, no hand-written response shapes.** See Key Conventions — the RPC contract is *derived* from inference, so a second hand-written source of truth can silently disagree with it.
- **Copying a sibling module copies its warts.** Read siblings for the *pattern*, not to paste. When you do spot a smell, grep for it — it is almost never in only the file you're looking at.
- **Comment the live constraint, not the archaeology.** A comment earns its place by explaining something still true and non-obvious (why a day's rows are renumbered before the source day is closed). One that narrates how the code got here — a bug that no longer exists, a type that was removed — is noise the next reader has to disprove.

#### Household scoping

Household-scoped routes mount `withHousehold` (`src/middleware/household.middleware.ts`), which resolves the caller's household once and exposes it as a non-nullable `c.var.household`. Compose `withHouseholdOwner` on top for owner-only actions (403 when not the owner).

- Mount it **per sub-app, never globally** — routes that must work without a household (creating one, reading/accepting an invite, `/users`) stay outside it. See how `households.app.ts` splits `/my/*` into its own sub-app.
- Service methods take a `householdId: number`, never a `userId`. Authorization lives in the routing layer; services are pure household operations. Scope every query by `householdId` so ids from other households 404 rather than leak.
- Services must not import Hono types. If a service needs request headers, take `headers: Headers` — a `Context` typed to the narrow env isn't assignable from the widened one.

#### Realtime events (Ably pub/sub)

`withHousehold` also owns realtime dispatch: it exposes `c.var.emit(...)`, buffers what a request emits, and publishes **one** batched message to the household's Ably channel after the handler succeeds. Subscribers turn that into TanStack Query invalidations, so a member with the app open sees another member's change without refreshing.

- **Every mutating handler under `withHousehold` calls `c.var.emit(...)`** — one call per distinct effect. `POST /recipes` emits `recipe` *and* `ingredient`, because saving a recipe also mints library rows; `POST /medical-info/:id/contacts` emits `contact` and `medical_info`. A handler that mutates and doesn't emit is a bug that only shows up as a stale second browser.
- The payload is `{ entity, id, parentId?, operation }` (`modules/realtime/realtime.model.ts`) — **never the entity itself**. `parentId` is only for entities the client caches under their parent (a dictionary entry's `dictionaryId`). Add an entity to the enum and the web's `invalidators` record fails to compile until it's mapped.
- **Never derive a household id anywhere but `c.var.household`.** Channel names come from `RealtimeService.channelName`, and the token's capability is minted against that same string, so a tab is cryptographically confined to one household's channel — clients get `subscribe` only, never `publish`. Routes outside `withHousehold` (households, members, invites, `/users/me`) don't emit yet.
- Nothing is emitted when a request fails: a thrown `HTTPException` never reaches the flush, and a validator's 400 leaves `c.res.ok` false.
- `HOMEWISE_ABLY_API_KEY` is **required** — the server refuses to boot without it, like `DATABASE_URL`. There is deliberately no "run without realtime" path: a household whose members silently stop seeing each other's changes is broken in a way nobody reports. (A *runtime* publish failure is different — it's logged and swallowed, so the broker can never fail a mutation that already committed.) `HOMEWISE_REALTIME_NAMESPACE` prefixes every channel (`local`, `pr-27`, `production`, a per-run `test-…`); household ids repeat across databases, so without it one Ably app would deliver production events to a dev machine.

#### Models derive from the schema

**The DB is the source of truth for what a payload contains.** A create/patch model that writes a row is built with drizzle-zod's `createInsertSchema`/`createUpdateSchema` over the table, and every `pgEnum` is mirrored with `createSelectSchema(schema.xEnum)` rather than a hand-written `z.enum([...])`. Adding or dropping a column is then a compile error somewhere, not a copy that silently disagrees — the hand-mirrored enums in particular meant adding a DB value left the API rejecting it.

Three things about drizzle-zod's shape, all of which have already cost time — the rule is written above `dbOwnedColumns` in `#lib/models`:

- **Refine with the callback form, never a bare schema.** `name: (model) => model.min(1)`, or `recordedAt: () => z.iso.date()` when the generated schema is the wrong type outright. A bare schema replaces the generated one *including its wrappers*, so a nullable column stops taking `null` and — the one that bites — every field of a `createUpdateSchema` becomes **required**. A PATCH model that demands every key type-checks perfectly and fails on the first partial update.
- **A nullable column with no default comes out required-but-nullable** on an insert schema. `.partial({ field: true })` is what makes it omittable.
- **`.extend()` where the payload deliberately differs from the column.** Optional text is the standing case: the API's "cleared" is `''` (see `optionalText`), the column's is NULL, and a `| null` leaking out reaches a react-hook-form field that cannot hold one. Same for keys that aren't columns at all — `categoryName`/`storeName` (found-or-created), `image`/`avatar` (resolved to a blob URL), a recipe's nested `ingredients`.

**`.omit(dbOwnedColumns)` on every one.** Ids and timestamps belong to the DB and `householdId` comes from `withHousehold`, never from the payload. Spell out any further server-owned columns beside it (`currency` copied off the household, `paidBackAt` driven by a `paidBack` toggle, `createdBy` off the session).

**What stays hand-written: a payload that is a *command over* a row rather than the row.** `checked` drives a stored `checkedAt`/`checkedBy` pair, `position` drives a resequence, `memberIds` is a join table — deriving those means overriding every field to get nothing back. The shopping-list item and planned-meal models say so in a comment; don't "fix" them.

Also derived from the column, so don't restate it: nullability and enum values. **Not** derived, so you must state it:

- A `date` column generates a bare `z.string()` — it accepts `2026-13-45` and `nope` alike. Use `z.iso.date()`, or `clearableDate` where a form can blank it.
- A `numeric` column generates a **string** schema unless it's declared `mode: 'number'` (ours are, so it's a `z.number()` carrying the precision range and nothing else). Either way there is no decimal-places check and no positivity check, so money always keeps an explicit `moneyAmount(...)` — the one that matters is the 2-decimal rule, which is `toFixed`-based rather than `.multipleOf(0.01)` because 0.01 has no exact binary representation and would reject 8.29.

#### API shape

- **A collection that can grow unbounded gets its own list endpoint** (`GET /:id/entries`), carrying `search`, `sortKey`, `sortDirection` and any filters as query params. Don't nest a full collection inside its parent's detail response — the detail endpoint returns metadata plus a **count** (`entryCount`), so filtering a list never refetches parent metadata.
- Sort params use a **Zod enum mapped onto a Drizzle column** — never string-interpolate a column name. Give every list param `.default(...).catch(...)` so a malformed query string degrades to sane defaults instead of a 400. `search` and `sortDirection` come from `#lib/models`; only the sort key is per-entity.
- Name relations for **what they are**, not their table. A dictionary's `child` (who it's for) and an entry's `creator` (who added it) are both `household_member`/`user` joins — `member` for either would be ambiguous. Mutations return the same joined shape as reads, so a created row and a refetched one aren't different types.
- Dates use `z.iso.date()` — never a hand-rolled `YYYY-MM-DD` regex, and never the bare `z.string()` drizzle-zod generates for a `date` column; both accept `2026-13-45`. Optional dates a form can clear are `clearableDate.optional()` (`#lib/models`), normalized to `null` in the service.

#### Images & file uploads (Vercel blob)

All uploads go through `ImagesService` (`src/modules/images/images.service.ts`) and are stored on **Vercel blob**. Files come in as multipart via `zValidator('form', …)` (see `users.app.ts` `/me`); on the web send them through the RPC client's `form` field.

- **Store the blob URL, never a client-relative path.** The persisted value (e.g. `profilePicture`) must be a full `https://…blob.vercel-storage.com/…` URL so it's portable across clients (web *and* a future mobile app). Never store `/some-asset.svg` pointing at one app's bundled assets.
- **A single blob-URL column fed by a photo/avatar/clear payload is a "managed image field" — don't hand-roll it.** In `patch`, call `ImagesService.resolveManagedImage(payload, existingUrl, { ownedPrefix, size })` then `commitManagedImage(update, write)` where `write` runs the `db.update(…).returning(…)` and returns whether a row persisted (404 when it didn't); in `delete`, call `cleanupOwnedImage(url, ownedPrefix)`. This handles the owned-vs-shared namespaces, avatar dedup, upload-before-write ordering with concurrent-delete rollback, old-blob retirement, and best-effort/guarded cleanup for you. See `child-profiles`/`pet-profiles` services.

For the full architecture and the recipe to add one to a new entity, invoke the **`working-with-images-on-server`** skill.

### Frontend (`apps/web`)

TanStack Router with **file-based routing**. Route file conventions:
- `_layout.tsx` — layout wrapper (prefixed with `_`)
- `-components/` — co-located components not treated as routes (prefixed with `-`)
- `routeTree.gen.ts` — auto-generated, never edit manually

Route nesting reflects auth/onboarding requirements:
- `_authenticated/` — requires a valid session (redirects to `/login`)
- `_authenticated/_onboarded/` — requires an active household (redirects to `/onboarding`)

API calls use the **Hono RPC client** (`src/api/client.ts`) initialized with `hc<AppType>()`, giving fully type-safe request/response on the client. All requests use `credentials: 'include'` for session cookie forwarding.

Data fetching uses **TanStack Query** with `queryOptions` helpers defined alongside each feature (e.g., `src/modules/households/households.queries.ts`). Session is cached with a 5-minute stale time.

Query keys are hierarchical so prefix matching does the work: `['<domain>', 'list']`, `['<domain>', id]`, `['<domain>', id, 'entries', queryParams]`. Including the params object in the key caches each search/sort combination separately.

**Invalidation is targeted and never awaited.** Invalidate only the keys a mutation can actually affect — `['<domain>', id]` already covers `['<domain>', id, 'entries', …]` by prefix, so listing it separately is redundant. Use `exact: true` when you mean just that one key. The mutation has already succeeded server-side, so `await`ing the refetch only makes the UI feel laggy; fire it with `void`. Put helpers in the module (`invalidateDictionary(queryClient, id)`) and type the client as `QueryClient`, not `ReturnType<typeof useQueryClient>`.

**Realtime invalidation is a second, passive path — it doesn't replace the mutation's own.** `RealtimeProvider` (`src/modules/realtime`, mounted in `_onboarded`) subscribes to the household's Ably channel and maps each event onto the *same* `invalidate*` helpers a mutation calls. So a new domain needs (a) its helper, and (b) an entry in the `invalidators` record — which is keyed by the server's entity union, so a missing one is a compile error, not a silent gap.

- **Keep invalidating locally in the mutation handler.** The acting tab is identified by `CLIENT_ID` (`src/api/client.ts`, sent as `x-homewise-client-id` on every request) and *skips* its own event, so it would otherwise never refresh at all. Realtime is for the other tabs.
- Realtime mappings may be **coarser** than the change (`['child-profiles']` rather than one id): `invalidateQueries` only refetches *mounted* queries, so a domain nobody is looking at costs nothing — which is why the event payload doesn't carry every affected id.
- **`modules/realtime`'s barrel exports queries only — never the provider.** `realtime.client.ts` constructs the Ably client at module scope, so *when that module is evaluated* is when the tab starts opening a connection. `_onboarded`'s `beforeLoad` imports the barrel for the channel query, so re-exporting the provider there drags the client into the main bundle and every signed-out visitor loads the SDK and hammers a token endpoint that can only 401. Keeping it out means `autoCodeSplitting` lands it in the route's component chunk instead. `realtime-bundling.spec.ts` fails if this is undone.
- **Nothing closes the Ably connection, and nothing should.** It's scoped to the tab, not to a component. `AblyProvider` captures the instance at render while StrictMode re-runs effects *without* re-rendering, so a cleanup that closes it leaves the re-run `useChannel` attaching to a dead client (error 80017). For the same reason the client is a module `const` rather than `useState(() => new Ably.Realtime(…))` — StrictMode calls that initializer twice and discards one instance, which would leak its socket (measured: 2 clients per page load vs 1).
- **Because that client outlives the household, `RealtimeSync` re-authorizes on every mount and `skip`s the channel until the new token resolves.** A token names one channel; swapping households (delete one, create another) moves the tab to a different one *and* remounts this component, so there's no previous value to diff against — "authorize when the prop changes" misses it entirely. An attach carrying the previous household's token is refused with `40160`, and Ably never retries a channel that failed that way, so the tab is deaf until a reload. `serial-seed-mutations.spec.ts` covers it with a household swap driven entirely through client-side routing; a spec that reaches the page via `page.goto` rebuilds the client and proves nothing.

**Every route with a loader needs a `pendingComponent`** — use `<Spinner />` from `@homewise/ui/core` (it fills its container; pass `className="min-h-dvh min-w-dvw"` for the full-viewport variant).

**And an `errorComponent`, scoped to that route** — `<RouteError title="…" />` from `@/modules/shared`. Without one, a loader rejection (or a realtime refetch landing on a 404 because another member deleted the thing) climbs to the root boundary and replaces the *entire app*, sidebar included, with "Something went wrong!". Only the title is required: `icon`, `description` and the action all have defaults, and the default action is a reload because most failures are a request that didn't come back. Pass children where somewhere else is the better answer (`shopping-lists/$listId.tsx` offers a link back). Where a subject can genuinely vanish, say so specifically ("This list is gone"); where it can't, "Couldn't load X" is the honest title. A layout route covers whatever renders into its `<Outlet />`, so an overlay route needs none of its own.

**An empty state is the full `Empty` composition, not a one-liner.** `EmptyHeader` + `EmptyMedia variant="icon"` + `EmptyTitle` + `EmptyDescription`, and where there's an action to offer, `EmptyContent` with a **default**-variant `Button` inside it — see `family/kids/index.tsx`. A bare `<Empty>Nothing yet.</Empty>` with a ghost button next to it reads as unfinished beside every other empty state in the app. Distinguish "nothing here yet" from "nothing matches your filter", and only the first gets the create action.

**Page width is constrained on the content, never on the page.** Every route is `<main className="flex-1 space-y-6 p-4">` inside an unconstrained `SidebarInset`; there is no page container and no `mx-auto` anywhere. Where content would otherwise stretch uncomfortably wide, put a fractional cap on the block itself — `lg:max-w-2/3` (kid/pet profile cards, the meal-plan day list) or `lg:max-w-1/2` (settings, user profile). Headers, filter bars and toolbars stay full-bleed above it.

**A cell takes the id it patches and the value it renders — never `info.row.original`.** Read the value with `info.getValue()` and pass any extra fields by name (`<AmountCell amount={info.getValue()} currency={…} id={…} paidBack={…} />`). Handing the whole row down because it's to hand is a code smell: it hides what the cell actually depends on and re-renders it for changes to fields it never reads. The one standing exception is the row-actions cell, whose delete dialog and menu labels genuinely name the record — comment it where you use it.

**Every `useReactTable` passes `getRowId`** (exported from `@homewise/ui/core` beside `DataTable`). Its default is the row *index*, which `DataTable` uses as React's key — so when the list changes, each row's subtree keeps the state it had at that position while its props move on to a different record. An inline editor then belongs to one row and writes to another: an open rename committed after a realtime refetch renamed whichever ingredient took the old index. `ingredients.spec.ts` covers it by adding a row above an open editor mid-edit.

List/filter/sort state belongs in **URL search params** via `validateSearch` + `loaderDeps`, not `useState` — so a filtered view is shareable and survives a refresh.

**Tabs (and any switch between distinct sub-views) are real nested routes, not a `?tab=` search param.** Give the parent a `route.tsx` layout that renders the shared chrome (header, tab bar) plus an `<Outlet />`, an `index.tsx` whose `beforeLoad` throws `redirect(...)` to the default tab, and one route file per tab. Drive the active tab off `useMatchRoute`, and wrap each `TabsTrigger` (`asChild`) around a `<Link>`. Each tab then owns *its own* loader and search params — e.g. the dictionary tab keeps its `search`/`sort` params, the general tab carries none — instead of one route juggling a `tab` param alongside every tab's state. See `family/kids/$profileId/`. A search param is for ephemeral view state *within* a view (search/sort/filter); a route is for *which* view you're on. (`manage/household-members` predates this and still uses a `?tab=` param — migrate it to nested routes if you touch it.)

Domain-specific code that is reused across routes lives under `src/modules/<domain>/<mechanism>/<file>` — where `<mechanism>` is `components`, `hooks`, `queries`, `helpers`, etc. (e.g. `src/modules/households/components/add-member-forms.tsx`). Each mechanism folder exposes an `index.ts` barrel; import via `@/modules/<domain>/<mechanism>`. Keep route files thin — when the same domain component/hook/query appears in more than one route, extract it into the matching module folder rather than duplicating it. Route-local, single-use components stay co-located in the route's `-components/`.

### Shared UI (`packages/ui`)

ShadCN components built on Radix UI primitives + TailwindCSS v4. Add new components here when they are **generic and app-agnostic** (Button, Dialog, Calendar, Spinner).

**Read `src/core/index.ts` before building any UI.** Hand-rolling something the kit already ships is the most common way this codebase gets worse: a two-`Button` segmented toggle shipped once where `Tabs` was already exported and already used for exactly that (`modules/households/components/add-member-forms.tsx`). The same applies one level down — when a layout fights you, check whether a sibling primitive already solves it before inventing markup (`ComboboxFieldTrigger` exists because `SelectTrigger` had already solved label-left/chevron-right, and reusing its class string got the box, focus ring and `aria-invalid` state for free — though not its truncation and placeholder rules, which are keyed off `data-slot`/`data-placeholder` attributes only Radix's own `Select` sets).

Two structural traps in the kit, both of which have already cost a bug:

- **`Button` wraps all its children in one flex span** (for the `loading` overlay), so it has a single flex item: `justify-between` on a `Button` does nothing, and `truncate` on a label inside one can never fire. For a full-width, select-style trigger use `ComboboxFieldTrigger`, not a `Button`. That wrapper is also why the size variants match icon padding through `[data-slot=button-content]` as well as `>svg` — and why a loose `has-[svg]:` would be wrong, since it would catch the absolutely-positioned loading spinner and re-pad the button mid-request.
- **`ComboboxTrigger` vs `ComboboxFieldTrigger`** — the first is for an *action* that opens a picker ("Add ingredient"), the second is for a combobox used as a *form field*, and looks identical to a closed `Select`.

**`cursor: pointer` is a base-layer rule** in `apps/web/src/main.css`, covering `button:not(:disabled)` and `[role="button"]` — Tailwind v4's preflight is what set buttons to `cursor: default`. A new raw `<button>` doesn't need the class, and `packages/ui` components keep carrying their own `not-disabled:hover:cursor-pointer` because the package has to stand up in an app that doesn't import this stylesheet.

App-specific shared code — components/hooks/helpers reused across domains but meaningless outside this app — goes in `apps/web/src/modules/shared/<mechanism>/` (e.g. `modules/shared/components/confirm-delete-dialog.tsx`), with the same barrel convention as any other module. The test: would another app want this verbatim? If no, it belongs in `modules/shared`, not `packages/ui`.

**Adding a ShadCN component** — run `pnpm dlx shadcn@latest add <name>` from `packages/ui`, then correct what the CLI gets wrong:
- It prompts to overwrite existing files. **Never overwrite `button.tsx`** — it carries a custom `loading` prop and `not-disabled:hover` variants. The CLI is interactive and will hang in a non-interactive shell; expect to finish the job by hand.
- It writes pinned dep versions and pulls the unified `radix-ui` package. This repo uses per-component `@radix-ui/react-*` at `catalog:`. Add the version to `pnpm-workspace.yaml`'s catalog and reference `catalog:` in `package.json`.
- **It installs everything the registry lists, including deps the generated component never imports** — `calendar` pulls in `date-fns`, but the component only uses `react-day-picker` (which declares `date-fns` as its own dependency, not a peer). Check what the file actually imports before keeping a dep; `pnpm knip` will catch what you miss.
- Rewrite generated files to house style: relative `../lib/utils` import, `import { type ComponentProps } from 'react'`, alphabetized props.
- Export from `src/core/index.ts`, and add the dep to `apps/web/package.json` too if the app imports it directly (e.g. `date-fns`).

### Database

Drizzle ORM + PostgreSQL. Schema files are in `apps/server/src/db/schema/`. After changing a schema file, run `db:migrations:create` then `db:migrations:apply`.

Better Auth manages its own tables (`user`, `session`, `account`). Domain tables live in separate schema files (e.g., `household.ts`).

### End-to-end testing (`apps/e2e`)

Playwright drives the **real** app (web + server) end-to-end. Tests live in the dedicated `@homewise/e2e` workspace — **not** inside `apps/web`. E2E is the only test layer right now (no unit runner).

- **Structure**: `tests/*.spec.ts` are the specs; `tests/auth.setup.ts` is a `setup` project that logs the seed users in once and saves `storageState`, so specs start already authenticated. `pages/*.page.ts` are **Page Object Models** — selectors and actions live there so specs read as intent; `support/` holds config + `global-setup`/`global-teardown`.
- **Three project phases run in order** (`setup` → `parallel` → `exclusive`), sequenced by `dependencies`. Nearly everything belongs in `parallel`, which is `fullyParallel` — that's why specs must use uniquely-named rows. The handful that mutate a *shared seed row* (household name, user name, ownership) are quarantined into `serial-seed-mutations.spec.ts`, the single `exclusive` file, which runs alone at the end. Put a spec there only if it can't be made self-contained; a new spec needs no config change.
- **Fixtures are one source of truth**: the seeded user/household/member come from `apps/server/src/db/seed-fixtures.ts`, imported by both the seed and the tests via `@homewise/server/seed-fixtures`. Never hard-code seeded creds/names in a spec.
- **Selectors**: prefer role/label queries; add a `data-testid` only when semantics aren't enough. Make CRUD specs **self-contained** — create a uniquely-named row (e.g. `` `Thing ${Date.now()}` ``), assert, then remove it — so they're idempotent across reruns and never mutate the shared seed fixture.
- **The suite always runs the whole app locally — on a dev machine and on CI alike.** There is no "run against a deployed preview" mode. `globalSetup` stands up an isolated test Postgres (docker `postgres-test`, **:8766** — the dev DB on :8765 is never touched), migrates + reset-seeds it under `NODE_ENV=test`; `webServer` boots the Hono server plus the web app served as a **production build** (`vite build && vite preview`, since the dev server buckles under concurrent load); `globalTeardown` removes the container. Needs Docker.
- **`E2E_WEB_MODE=dev` runs the suite against the Vite dev server** instead of the production build. Reach for it when a change touches **mount/unmount lifecycles**: React StrictMode only double-invokes effects in development, so a component that tears down what it just set up passes the default mode and fails on `pnpm dev`. That exact bug shipped once — the Ably connection was closed by its own effect cleanup, so `pnpm dev` had no realtime while the whole suite was green. It's opt-in because the dev server is slower and buckles under concurrent load. Note the router devtools only exist in this mode, and `getByLabel` matches substrings: their match rows are labelled with serialized search params, so form-field locators must be scoped to `page.locator('form')` (see `recipes.page.ts` `formField`).
- **`reuseExistingServer` is `false`, deliberately.** The `env` block (`DATABASE_URL`, `HOMEWISE_DISABLE_EMAILS`) only applies to a process Playwright spawns itself, so adopting a running `pnpm dev` would silently point the whole suite at the **dev** DB — polluting real data and inventing failures from state the seed never resets. A busy :5173/:3000 now makes the run refuse to start instead. **Stop `pnpm dev` before running the suite.**
- **Emails are suppressed** in E2E via `HOMEWISE_DISABLE_EMAILS` (set in `playwright.config.ts`). Real Resend calls were rate-limited across workers and made the invite specs flaky; the specs assert on our own invite rows, not on delivery. The flag defaults to `false`, so preview and production are unaffected.
- **CI**: the `e2e` job lives in `.github/workflows/ci.yml` and runs exactly what a dev machine runs — full app on the runner, throwaway Postgres, no Neon and no deployed preview (that switch removed serverless cold starts and Neon round-trip latency as flake sources). It needs `BETTER_AUTH_SECRET`, `HOMEWISE_RESEND_API_KEY`, `HOMEWISE_FILES_READ_WRITE_TOKEN` and `HOMEWISE_ABLY_API_KEY`; the blob and Ably keys must be real — the photo specs upload for real, and the server refuses to boot without a broker. `DATABASE_URL` is **not** set on the job — `globalSetup`/`webServer` supply the test DB. Neon still backs the *deployed* preview (`preview.yml` migrates + seeds a per-PR branch during the server build), but no test touches it.
- **Not a turbo task** — run it directly (`pnpm test:e2e` = `pnpm --filter @homewise/e2e test`). Turbo adds nothing here: uncacheable, single package. Only `check-types` for the package goes through turbo.
- **When a deliberate change makes a spec fail**, update the spec (or its Page Object) to the new intended behavior — never delete it or `.skip` it just to go green. A red E2E on a PR is a required signal, not noise. Locally, `test:report` opens the HTML report; on CI the report + traces upload as an artifact on failure.

See the **`new-feature-module`** skill for how a new feature's E2E flow gets added.

## Key Conventions

- **Linting & formatting** are handled by [Biome](https://biomejs.dev/) via the root `biome.json` (single config, no per-package overrides). **Drive the diagnostic count to zero, not just the exit code** — warnings count as much as errors. For rules marked FIXABLE-but-unsafe (e.g. `nursery/useSortedClasses`), run `biome check --write --unsafe <files>` scoped to the files you touched, then diff the result. Tailwind class reordering is behaviourally inert because precedence comes from the generated stylesheet order, not the class attribute order.
- **Type-only imports** are enforced by Biome's `useImportType` (inline style: `import { type Foo }`).
- **Import organization** is enforced by Biome's `organizeImports` assist; unused imports/variables are auto-removed.
- Environment variables are validated at startup via `src/config/env.ts` (server) — add new vars there.
- The Hono `AppType` exported from `apps/server/src/index.ts` is the contract consumed by the web client — keep it exported.
- **Never hand-write request/response payload types on the web client.** Derive them from the Hono RPC client with `InferRequestType`/`InferResponseType` so they can't drift from the server contract. E.g. `type Payload = InferRequestType<typeof client.households.my.members[':id'].$patch>['json']` rather than `{ name?: string; nickname?: string }`. Same for response shapes consumed by tables/components.
  - **Narrow response types to the success status**: `InferResponseType<typeof $get, 200>`. Without the status argument the type unions in every declared error response, and property access collapses to `{}`.
- **Let the server infer its return types too — the same rule, from the other end.** No `): Promise<Foo>` on a service method, and no hand-written type for the shape it returns. The RPC contract *is* the inferred type, so a hand-written one is a second source of truth that can disagree with the code silently. Hand-writing a row shape as a function's *input* is fine and precedented (`MemberWithUser`, `MedicalInfoRow`, `PlannedMealRow`).
  - **When inference looks broken, the annotation is treating a symptom.** `members` once came out as `any` on the web; the cause was response *nesting depth* (`days[].meals[].members[]`, three arrays deep), and flattening the response fixed it and made every annotation removable. Deep nesting is the thing to suspect first.
  - **`pnpm check-types` cannot detect this** — `any` is assignable to everything, so a collapsed type passes silently. Prove it with a throwaway probe that forces the compiler to speak: `export const bad: number = a.meals[0]!.members[0]!.displayName;` **must** error. If it compiles, the type is `any`.
- **Dates**: display and parse day-first (European). The display format is `dd. MM. yyyy`, matching the tables. Never parse user input with `new Date(input)` — it reads `03. 07. 2026` as 7 March (US month-first). Use date-fns `parse` against an explicit day-first format list; it also rejects impossible dates like `31. 02.`.
- **Destructive actions always confirm.** Use `ConfirmDeleteDialog` from `@/modules/shared`; name the specific thing being deleted and mention the softer alternative (archive) when one exists.
  - **The one exception is an action that holds no content of its own and can be restored exactly** — removing a meal from the plan is the only current case. It removes immediately with an Undo toast (`toast.success(…, { action: { label: 'Undo', … } })`) that re-creates it from the fields already on screen, position included. The bar is high: if Undo can't put back *everything* that was lost, it's a confirm dialog. Don't extend this to recipes, profiles or households.
- **Editing in place beats a dialog for a field you can see.** `InlineTextField` (`@/modules/shared`) is the shared editor: mount it only while editing so its `defaultValues` reseed, give it the single field's zod schema lifted from the server model, and it handles commit-on-blur/Enter, Escape-to-cancel and the three guards that make those safe (an exit `blur` re-submitting an abandoned value; a server-refused value re-firing on every subsequent blur and trapping you in the field; an unchanged value costing a request). That last guard runs **before** validation, not inside the submit handler: an editor opened on an empty value — a brand-new entry — can never satisfy a `min(1)` schema, and flagging a field nobody typed into as invalid is a complaint about a value the user never entered. Pass `cancellable` where nothing on screen says Escape works. Inline *select-like* controls — the ingredient category cell, the meal-plan member popover — deliberately use **no** form: they're live controls with no submit and no field to hang a message on, so they commit on change and toast on failure.
- **A click-to-edit table cell is `InlineCell` (`@/modules/shared`), not a fresh copy of the pattern.** It owns the editing flag, the resting button and the hidden max-content **sizer** that stops the column resizing as the editor opens — an `<input>` reports a 20-character intrinsic width to an auto-layout table regardless of `w-full`, which is why `InlineTextField` passes `size={1}` and why something has to put the value's width back. The editor is *placed* into the sizer's grid cell (`col-start-1 row-start-1` on a **wrapper**, because `InlineTextField`'s class lands on the input and its form is `display: contents`); auto-placed it opens a second row and the row grows 22px on click. `InlineCellSizer` is the same arrangement for a control that's always mounted, like the date cell. Pass `fill` for free text, `maxWidthClassName` for a value with a natural length. The resting cell is labelled by **what it does** (`Edit name`), uniformly — the amount cell's content is a currency string, which is no way to name a control. For a cell whose value is *picked* rather than typed, pass `inlineTriggerClassName` (same module) to the `SelectTrigger` or combobox — same bargain, one class string, not a per-table copy.
- **An inline editor makes list identity load-bearing.** Key rows/cards by the record's own id (`getRowId` for tables, `key={record.id}` for lists) and hold the editing flag *inside* the row component. Keyed by position, an editor commits to whichever record later took that index — and realtime refetches lists underneath open editors, so this happens without the user doing anything. Both `ingredients.spec.ts` and `meal-plan.spec.ts` have a spec that adds a row above an open editor mid-edit; keep them.
- **A new mutating endpoint under `withHousehold` isn't done until it emits.** Add `c.var.emit(...)` in the handler and map the entity in the web's `invalidators` record. `emit` is that middleware's context variable, so it exists only there — a mutating route mounted outside it (households, members, invites, `/users/me`) has nothing to call and doesn't emit yet. Nothing fails loudly if you skip it — the only symptom is a second member's browser quietly showing stale data. See the realtime sections above.
- **Dependencies use `catalog:`** — add the version to `pnpm-workspace.yaml`'s catalog and reference `catalog:` from each `package.json`. Never pin a raw version in a workspace package.
- **A `TooltipTrigger asChild` around an enabled `DropdownMenuItem` swallows its `onClick`.** The household-members table gets away with the pattern only because its items are disabled whenever the tooltip content renders. For an always-enabled menu item, drop the tooltip.
- **Verify against the running app, not just the type-checker.** Boot the server and exercise the endpoints (including the negative cases: wrong role, cross-household id, duplicate, malformed input). Cover UI behavior with an **E2E flow**, not by hand-driving the browser — don't manually verify in the browser unless the user explicitly asks (it's slow; the tests are fast and repeatable). Type-checking passing is not evidence a feature works — a swallowed `onClick` and a US-vs-European date parse both type-check fine. Clean up any test data you create.
- **Before finishing, run all three**: `pnpm check-types`, `pnpm lint` (zero diagnostics), and `pnpm knip`. Each catches a category the others miss — knip is the only one that flags a dependency declared in a `package.json` that nothing in that package actually imports.
- **Every user-facing feature ships with an E2E flow.** When you add or materially change a feature, add or extend a Playwright spec in `apps/e2e` that drives its happy path through the real UI (see the E2E testing section and the `new-feature-module` skill). The feature isn't done until it has one.
- **Run the full E2E suite as the final gate — once, not continuously.** After `check-types`/`lint`/`knip` are green, run `pnpm test:e2e` as the last step before telling the user you're done. The E2E flow **is** how you confirm the feature works and nothing regressed — don't hand-drive the browser to verify (it's slow and error-prone; that's exactly what these tests replace). Do **not** run the suite repeatedly while developing — it's slow and needs Docker; it's a final verification, not an inner-loop tool. Report the result honestly: if it fails, say so with the output rather than declaring done.
- **Always use react-hook-form for forms and form fields** — never track field values with `useState`. Use `useForm` with `zodResolver(<server model>)`, explicit `defaultValues`, and the shared `Form`/`FormField`/`FormItem`/`FormControl`/`FormLabel`/`FormMessage` components from `@homewise/ui/core/form`. Reuse the exported Zod model that matches the endpoint (e.g. `patchHouseholdMemberModel`) as the resolver so validation and the request payload stay aligned. This applies even to single-field dialogs.
  - **A custom component used inside `FormControl` must not declare an `id` prop — it must forward one.** `FormControl` is a Radix `Slot` that clones its child with `id={formItemId}`, the id `FormLabel`'s `htmlFor` points at, plus `aria-describedby` and `aria-invalid`. Slot's `mergeProps` lets the **child's** props win, so a component with its own `id` overrides the generated one and detaches the label. `DateField` did this: four call sites hid it by passing `htmlFor` on the label by hand, and the one that forgot shipped a `<label>` attached to nothing. Spread the rest of the props onto the underlying input (`...inputProps`) and let the form wire it up. A control that sits *outside* a `Form` (the shopping-list import range) does take an explicit `id` with a matching `Label htmlFor` — that pairing is correct there.
  - **A form control with no `<label>` still needs a name.** Inline table cells are the case: the column header names the column, not the input. Give them an `ariaLabel`, and locate them in E2E by that name. A spec matching a *placeholder* is a sign the control has no accessible name at all.

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

Hono.js app with a module-based structure. Each feature module lives in `src/modules/<feature>/` and contains:
- `<feature>.app.ts` — Hono router with route definitions
- `<feature>.service.ts` — Business logic and DB queries
- `models/` — Zod schemas and TypeScript types

Middleware chain: Logger → CORS → Auth session guard → Routes.

Request validation uses a custom Zod validator wrapper in `src/lib/validation.ts`. The `AppContext` type (`src/types/app.type.ts`) carries `user` and `session` in Hono's context variables.

Auth is handled by **better-auth** (`src/lib/auth.ts`), using the Drizzle adapter and Resend for transactional email.

`src/lib/` holds the pure, domain-free helpers every module may reach for: `models.ts` (`optionalText`), `dates.ts` (UTC `YYYY-MM-DD` arithmetic), `validation.ts`. `src/db/utils.ts` holds the DB-scoped ones (`Executor`, `emptyToNull`, `isUniqueViolation`).

#### Services are the cornerstone — hold them to it

Business logic lives in services, so they get the strictest reading of any file in the repo. Before finishing one, re-read it against `recipes.service.ts` / `ingredients.service.ts` and check all of:

- **Nothing generic in a feature module.** If a helper has nothing domain-specific in it — date arithmetic, string shaping, clamping — it belongs in `src/lib/`, not beside the feature that happened to need it first. Date maths in particular is already there: import from `@/lib/dates`, never re-derive `startOfISOWeek`/`addDays` locally (that mistake shipped once *and* got copy-pasted into `db/seed.ts`).
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
- The payload is `{ entity, id, parentId?, operation }` (`modules/realtime/models`) — **never the entity itself**. `parentId` is only for entities the client caches under their parent (a dictionary entry's `dictionaryId`). Add an entity to the enum and the web's `invalidators` record fails to compile until it's mapped.
- **Never derive a household id anywhere but `c.var.household`.** Channel names come from `RealtimeService.channelName`, and the token's capability is minted against that same string, so a tab is cryptographically confined to one household's channel — clients get `subscribe` only, never `publish`. Routes outside `withHousehold` (households, members, invites, `/users/me`) don't emit yet.
- Nothing is emitted when a request fails: a thrown `HTTPException` never reaches the flush, and a validator's 400 leaves `c.res.ok` false.
- `HOMEWISE_ABLY_API_KEY` is **required** — the server refuses to boot without it, like `DATABASE_URL`. There is deliberately no "run without realtime" path: a household whose members silently stop seeing each other's changes is broken in a way nobody reports. (A *runtime* publish failure is different — it's logged and swallowed, so the broker can never fail a mutation that already committed.) `HOMEWISE_REALTIME_NAMESPACE` prefixes every channel (`local`, `pr-27`, `production`, a per-run `test-…`); household ids repeat across databases, so without it one Ably app would deliver production events to a dev machine.

#### API shape

- **A collection that can grow unbounded gets its own list endpoint** (`GET /:id/entries`), carrying `search`, `sortKey`, `sortDirection` and any filters as query params. Don't nest a full collection inside its parent's detail response — the detail endpoint returns metadata plus a **count** (`entryCount`), so filtering a list never refetches parent metadata.
- Sort params use a **Zod enum mapped onto a Drizzle column** — never string-interpolate a column name. Give every list param `.default(...).catch(...)` so a malformed query string degrades to sane defaults instead of a 400.
- Name relations for **what they are**, not their table. A dictionary's `child` (who it's for) and an entry's `creator` (who added it) are both `household_member`/`user` joins — `member` for either would be ambiguous. Mutations return the same joined shape as reads, so a created row and a refetched one aren't different types.
- Dates use `z.iso.date()` — never a hand-rolled `YYYY-MM-DD` regex, which accepts `2026-13-45`. Optional dates that a form can clear are `z.iso.date().or(z.literal('')).optional()`, normalized to `null` in the service.

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

**Page width is constrained on the content, never on the page.** Every route is `<main className="flex-1 space-y-6 p-4">` inside an unconstrained `SidebarInset`; there is no page container and no `mx-auto` anywhere. Where content would otherwise stretch uncomfortably wide, put a fractional cap on the block itself — `lg:max-w-2/3` (kid/pet profile cards, the meal-plan day list) or `lg:max-w-1/2` (settings, user profile). Headers, filter bars and toolbars stay full-bleed above it.

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
- **An inline editor makes list identity load-bearing.** Key rows/cards by the record's own id (`getRowId` for tables, `key={record.id}` for lists) and hold the editing flag *inside* the row component. Keyed by position, an editor commits to whichever record later took that index — and realtime refetches lists underneath open editors, so this happens without the user doing anything. Both `ingredients.spec.ts` and `meal-plan.spec.ts` have a spec that adds a row above an open editor mid-edit; keep them.
- **A new mutating endpoint under `withHousehold` isn't done until it emits.** Add `c.var.emit(...)` in the handler and map the entity in the web's `invalidators` record. `emit` is that middleware's context variable, so it exists only there — a mutating route mounted outside it (households, members, invites, `/users/me`) has nothing to call and doesn't emit yet. Nothing fails loudly if you skip it — the only symptom is a second member's browser quietly showing stale data. See the realtime sections above.
- **Dependencies use `catalog:`** — add the version to `pnpm-workspace.yaml`'s catalog and reference `catalog:` from each `package.json`. Never pin a raw version in a workspace package.
- **A `TooltipTrigger asChild` around an enabled `DropdownMenuItem` swallows its `onClick`.** The household-members table gets away with the pattern only because its items are disabled whenever the tooltip content renders. For an always-enabled menu item, drop the tooltip.
- **Verify against the running app, not just the type-checker.** Boot the server and exercise the endpoints (including the negative cases: wrong role, cross-household id, duplicate, malformed input). Cover UI behavior with an **E2E flow**, not by hand-driving the browser — don't manually verify in the browser unless the user explicitly asks (it's slow; the tests are fast and repeatable). Type-checking passing is not evidence a feature works — a swallowed `onClick` and a US-vs-European date parse both type-check fine. Clean up any test data you create.
- **Before finishing, run all three**: `pnpm check-types`, `pnpm lint` (zero diagnostics), and `pnpm knip`. Each catches a category the others miss — knip is the only one that flags a dependency declared in a `package.json` that nothing in that package actually imports.
- **Every user-facing feature ships with an E2E flow.** When you add or materially change a feature, add or extend a Playwright spec in `apps/e2e` that drives its happy path through the real UI (see the E2E testing section and the `new-feature-module` skill). The feature isn't done until it has one.
- **Run the full E2E suite as the final gate — once, not continuously.** After `check-types`/`lint`/`knip` are green, run `pnpm test:e2e` as the last step before telling the user you're done. The E2E flow **is** how you confirm the feature works and nothing regressed — don't hand-drive the browser to verify (it's slow and error-prone; that's exactly what these tests replace). Do **not** run the suite repeatedly while developing — it's slow and needs Docker; it's a final verification, not an inner-loop tool. Report the result honestly: if it fails, say so with the output rather than declaring done.
- **Always use react-hook-form for forms and form fields** — never track field values with `useState`. Use `useForm` with `zodResolver(<server model>)`, explicit `defaultValues`, and the shared `Form`/`FormField`/`FormItem`/`FormControl`/`FormLabel`/`FormMessage` components from `@homewise/ui/core/form`. Reuse the exported Zod model that matches the endpoint (e.g. `patchHouseholdMemberModel`) as the resolver so validation and the request payload stay aligned. This applies even to single-field dialogs.

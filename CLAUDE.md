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

# Testing (web only)
pnpm test                       # Run Vitest once
pnpm test:ui                    # Interactive Vitest UI with coverage
pnpm test:coverage              # Coverage report
```

Requires Node.js >=24 and Docker (for local Postgres on port 8765).

## Architecture

### Backend (`apps/server`)

Hono.js app with a module-based structure. Each feature module lives in `src/modules/<feature>/` and contains:
- `<feature>.app.ts` — Hono router with route definitions
- `<feature>.service.ts` — Business logic and DB queries
- `models/` — Zod schemas and TypeScript types

Middleware chain: Logger → CORS → Auth session guard → Routes.

Request validation uses a custom Zod validator wrapper in `src/lib/validation.ts`. The `AppContext` type (`src/types/app.type.ts`) carries `user` and `session` in Hono's context variables.

Auth is handled by **better-auth** (`src/lib/auth.ts`), using the Drizzle adapter and Resend for transactional email.

#### Household scoping

Household-scoped routes mount `withHousehold` (`src/middleware/household.middleware.ts`), which resolves the caller's household once and exposes it as a non-nullable `c.var.household`. Compose `withHouseholdOwner` on top for owner-only actions (403 when not the owner).

- Mount it **per sub-app, never globally** — routes that must work without a household (creating one, reading/accepting an invite, `/users`) stay outside it. See how `households.app.ts` splits `/my/*` into its own sub-app.
- Service methods take a `householdId: number`, never a `userId`. Authorization lives in the routing layer; services are pure household operations. Scope every query by `householdId` so ids from other households 404 rather than leak.
- Services must not import Hono types. If a service needs request headers, take `headers: Headers` — a `Context` typed to the narrow env isn't assignable from the widened one.

#### API shape

- **A collection that can grow unbounded gets its own list endpoint** (`GET /:id/entries`), carrying `search`, `sortKey`, `sortDirection` and any filters as query params. Don't nest a full collection inside its parent's detail response — the detail endpoint returns metadata plus a **count** (`entryCount`), so filtering a list never refetches parent metadata.
- Sort params use a **Zod enum mapped onto a Drizzle column** — never string-interpolate a column name. Give every list param `.default(...).catch(...)` so a malformed query string degrades to sane defaults instead of a 400.
- Name relations for **what they are**, not their table. A dictionary's `child` (who it's for) and an entry's `creator` (who added it) are both `household_member`/`user` joins — `member` for either would be ambiguous. Mutations return the same joined shape as reads, so a created row and a refetched one aren't different types.
- Dates use `z.iso.date()` — never a hand-rolled `YYYY-MM-DD` regex, which accepts `2026-13-45`. Optional dates that a form can clear are `z.iso.date().or(z.literal('')).optional()`, normalized to `null` in the service.

#### Images & file uploads (Vercel blob)

All uploads go through `ImagesService` (`src/modules/images/images.service.ts`) and are stored on **Vercel blob**. Files come in as multipart via `zValidator('form', …)` (see `users.app.ts` `/me`); on the web send them through the RPC client's `form` field.

- **Store the blob URL, never a client-relative path.** The persisted value (e.g. `profilePicture`) must be a full `https://…blob.vercel-storage.com/…` URL so it's portable across clients (web *and* a future mobile app). Never store `/some-asset.svg` pointing at one app's bundled assets.
- **Per-entity uploads are namespaced and disposable:** `ImagesService.put(file, \`<entity>/<id>/<name>\`, { size })` (resizes, `addRandomSuffix: true`). Replacing or clearing one deletes the old blob — but **guard deletion to paths you own** (e.g. only `new URL(url).pathname.startsWith('/child-profiles/')`), so shared blobs are never touched.
- **Shared, deduplicated assets use a deterministic path and are never deleted.** For assets many rows point at (e.g. avatars): `ImagesService.find(pathname)` first, and only `putStable(pathname, bytes, contentType)` (`addRandomSuffix: false`) on a miss — so the same asset always resolves to the same URL and is uploaded at most once.
- **The client owns which client-provided assets exist; the server only dedups + sanitizes.** Don't bundle those assets on the server, prepopulate storage, or add a "list assets" endpoint — the client bundles them and uploads the chosen bytes. When the upload's **filename doubles as the storage-path key** (the dedup identity), validate it as a safe path segment (`/^[a-z0-9-]+\.[a-z0-9]+$/`) so a crafted name can't escape the folder or overwrite another blob. See `child-profiles` avatar handling.

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

**Every route with a loader needs a `pendingComponent`** — use `<Spinner />` from `@homewise/ui/core` (it fills its container; pass `className="min-h-dvh min-w-dvw"` for the full-viewport variant).

List/filter/sort state belongs in **URL search params** via `validateSearch` + `loaderDeps`, not `useState` — so a filtered view is shareable and survives a refresh.

**Tabs (and any switch between distinct sub-views) are real nested routes, not a `?tab=` search param.** Give the parent a `route.tsx` layout that renders the shared chrome (header, tab bar) plus an `<Outlet />`, an `index.tsx` whose `beforeLoad` throws `redirect(...)` to the default tab, and one route file per tab. Drive the active tab off `useMatchRoute`, and wrap each `TabsTrigger` (`asChild`) around a `<Link>`. Each tab then owns *its own* loader and search params — e.g. the dictionary tab keeps its `search`/`sort` params, the general tab carries none — instead of one route juggling a `tab` param alongside every tab's state. See `family/kids/$profileId/`. A search param is for ephemeral view state *within* a view (search/sort/filter); a route is for *which* view you're on.

Domain-specific code that is reused across routes lives under `src/modules/<domain>/<mechanism>/<file>` — where `<mechanism>` is `components`, `hooks`, `queries`, `helpers`, etc. (e.g. `src/modules/households/components/add-member-forms.tsx`). Each mechanism folder exposes an `index.ts` barrel; import via `@/modules/<domain>/<mechanism>`. Keep route files thin — when the same domain component/hook/query appears in more than one route, extract it into the matching module folder rather than duplicating it. Route-local, single-use components stay co-located in the route's `-components/`.

### Shared UI (`packages/ui`)

ShadCN components built on Radix UI primitives + TailwindCSS v4. Add new components here when they are **generic and app-agnostic** (Button, Dialog, Calendar, Spinner).

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

## Key Conventions

- **Linting & formatting** are handled by [Biome](https://biomejs.dev/) via the root `biome.json` (single config, no per-package overrides). **Drive the diagnostic count to zero, not just the exit code** — warnings count as much as errors. For rules marked FIXABLE-but-unsafe (e.g. `nursery/useSortedClasses`), run `biome check --write --unsafe <files>` scoped to the files you touched, then diff the result. Tailwind class reordering is behaviourally inert because precedence comes from the generated stylesheet order, not the class attribute order.
- **Type-only imports** are enforced by Biome's `useImportType` (inline style: `import { type Foo }`).
- **Import organization** is enforced by Biome's `organizeImports` assist; unused imports/variables are auto-removed.
- Environment variables are validated at startup via `src/config/env.ts` (server) — add new vars there.
- The Hono `AppType` exported from `apps/server/src/index.ts` is the contract consumed by the web client — keep it exported.
- **Never hand-write request/response payload types on the web client.** Derive them from the Hono RPC client with `InferRequestType`/`InferResponseType` so they can't drift from the server contract. E.g. `type Payload = InferRequestType<typeof client.households.my.members[':id'].$patch>['json']` rather than `{ name?: string; nickname?: string }`. Same for response shapes consumed by tables/components.
  - **Narrow response types to the success status**: `InferResponseType<typeof $get, 200>`. Without the status argument the type unions in every declared error response, and property access collapses to `{}`.
- **Dates**: display and parse day-first (European). The display format is `dd. MM. yyyy`, matching the tables. Never parse user input with `new Date(input)` — it reads `03. 07. 2026` as 7 March (US month-first). Use date-fns `parse` against an explicit day-first format list; it also rejects impossible dates like `31. 02.`.
- **Destructive actions always confirm.** Use `ConfirmDeleteDialog` from `@/modules/shared`; name the specific thing being deleted and mention the softer alternative (archive) when one exists.
- **Dependencies use `catalog:`** — add the version to `pnpm-workspace.yaml`'s catalog and reference `catalog:` from each `package.json`. Never pin a raw version in a workspace package.
- **A `TooltipTrigger asChild` around an enabled `DropdownMenuItem` swallows its `onClick`.** The household-members table gets away with the pattern only because its items are disabled whenever the tooltip content renders. For an always-enabled menu item, drop the tooltip.
- **Verify against the running app, not just the type-checker.** Boot the server and exercise the endpoints (including the negative cases: wrong role, cross-household id, duplicate, malformed input), then drive the actual UI. Type-checking passing is not evidence a feature works — a swallowed `onClick` and a US-vs-European date parse both type-check fine. Clean up any test data you create.
- **Before finishing, run all three**: `pnpm check-types`, `pnpm lint` (zero diagnostics), and `pnpm knip`. Each catches a category the others miss — knip is the only one that flags a dependency declared in a `package.json` that nothing in that package actually imports.
- **Always use react-hook-form for forms and form fields** — never track field values with `useState`. Use `useForm` with `zodResolver(<server model>)`, explicit `defaultValues`, and the shared `Form`/`FormField`/`FormItem`/`FormControl`/`FormLabel`/`FormMessage` components from `@homewise/ui/core/form`. Reuse the exported Zod model that matches the endpoint (e.g. `patchHouseholdMemberModel`) as the resolver so validation and the request payload stay aligned. This applies even to single-field dialogs.

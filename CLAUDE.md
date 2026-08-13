# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

It is deliberately short: a map, the commands, and the rules that must never be missed. Everything
else lives in a skill — see "Where the detail lives" below, and load the relevant one **before** you
start, not after something breaks.

## Overview

Homewise is a household management app — a TypeScript monorepo using **Turbo** for task orchestration and **pnpm** as the package manager.

```
apps/
  server/   # Hono.js REST API
  web/      # React + TanStack Router SPA
  e2e/      # Playwright suite (drives the real app)
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

# Testing
pnpm test                       # Unit suite (Vitest, apps/server + apps/web + packages/ui) → `unit-testing`
pnpm test:watch                 # Watch mode
pnpm test:e2e                   # Full E2E suite (Playwright, needs Docker) → `e2e-testing`
```

Requires Node.js >=24 and Docker (local dev Postgres on 8765; the E2E suite spins up its own throwaway Postgres on 8766, the unit suite its own on 8767 — three separate containers on three ports, so neither suite can write into the other's data or into the dev DB).

## Architecture

### Backend (`apps/server`)

Hono.js, module-based. Each feature module lives in `src/modules/<feature>/` and is **flat** —
`<feature>.app.ts` (routes), `<feature>.service.ts` (business logic + DB), `<feature>.model.ts` (Zod),
an optional `<feature>.constants.ts`, and a one-line `index.ts`. Middleware chain: Logger → CORS →
Auth session guard → Routes. Auth is **better-auth** (`src/lib/auth.ts`); env vars are validated at
startup in `src/config/env.ts`. Household-scoped routes mount `withHousehold`, which exposes
`c.var.household` and `c.var.emit`. Shared, domain-free helpers live in `src/lib/` (`models.ts`,
`dates.ts`, `validation.ts`) and `src/db/utils.ts`. Non-relative imports are Node
`package.json#imports` (`#lib/dates`), never `@/*`. → `server-conventions`,
`server-build-and-imports`

### Frontend (`apps/web`)

TanStack Router with file-based routing (`_authenticated/` requires a session, `_authenticated/_onboarded/`
requires a household). API calls go through the **Hono RPC client** (`src/api/client.ts`,
`hc<AppType>()`), data fetching through **TanStack Query** with hierarchical keys and one
`<domain>.queries.ts` per module holding its `queryOptions` + `invalidate*` helpers. Other reused
domain code lives in `src/modules/<domain>/<mechanism>/` behind a barrel (`components`, `hooks`,
`helpers`, `constants` — queries are the exception and stay a root-level file); app-wide shared code
in `modules/shared/`.
→ `web-conventions`, `ui-conventions`

### Shared UI (`packages/ui`)

ShadCN on Radix + TailwindCSS v4, exported from `src/core/index.ts`. New components go here only when
they are generic and app-agnostic. → `ui-conventions`

### Database

Drizzle ORM + PostgreSQL. Schema files are in `apps/server/src/db/schema/`. After changing a schema file, run `db:migrations:create` then `db:migrations:apply`.

Better Auth manages its own tables (`user`, `session`, `account`). Domain tables live in separate schema files (e.g., `household.ts`).

## Where the detail lives

Load the skill before starting the work, not after something breaks. Each is the full detail behind
the one-liners below.

| Working on | Load first |
|---|---|
| A new household-scoped feature, end to end | `new-feature-module` |
| A server module, service, route, Zod model or endpoint | `server-conventions` |
| Server tsconfig, imports/exports map, build script or Vercel config | `server-build-and-imports` |
| A web route, loader, query, mutation or module | `web-conventions` |
| Any component, form, table, cell, dialog or empty state | `ui-conventions` |
| A mutating endpoint, or stale data in a second tab | `realtime-events` |
| A Playwright spec, or verifying that a feature works | `e2e-testing` |
| A Vitest test, or deciding whether something earns one | `unit-testing` |
| Any server-side image, photo, avatar or file upload | `working-with-images-on-server` |
| Ably SDK questions beyond our own wiring | `using-ably` |
| Committing work | `commit-files` |

## Non-negotiables

Each of these has already shipped as a bug or cost real time. Where a skill is named, it explains why.

1. **Linting & formatting** are handled by [Biome](https://biomejs.dev/) via the root `biome.json` (single config, no per-package overrides). **Drive the diagnostic count to zero, not just the exit code** — warnings count as much as errors. For rules marked FIXABLE-but-unsafe (e.g. `nursery/useSortedClasses`), run `biome check --write --unsafe <files>` scoped to the files you touched, then diff the result — Tailwind class reordering is behaviourally inert because precedence comes from the generated stylesheet order, not the class attribute order. Type-only imports are enforced by `useImportType` (inline style: `import { type Foo }`); the `organizeImports` assist auto-removes unused imports and variables.
2. **Dependencies use `catalog:`** — add the version to `pnpm-workspace.yaml`'s catalog and reference `catalog:` from each `package.json`. Never pin a raw version in a workspace package. Root-only tooling that no workspace package imports may hold a direct version in the root `package.json` (`turbo` does); a catalog entry for a single consumer buys nothing.
3. **Never hand-write request/response payload types on the web** — derive them from the RPC client with `InferRequestType`/`InferResponseType`, and narrow responses to the success status (`, 200`). → `web-conventions`
4. **Never annotate a service's return type** or hand-write the shape it returns. If inference collapses to `any`, the cause is nesting depth — fix that and prove it with a compiler probe. `pnpm check-types` cannot detect it. → `server-conventions`
5. **Models derive from the DB schema** via drizzle-zod (`createInsertSchema`/`createUpdateSchema`, `createSelectSchema` for every enum) — never a hand-written mirror, and never refine with a bare schema. → `server-conventions`
6. **Every mutating handler under `withHousehold` calls `c.var.emit(...)`** and maps its entity in the web's `invalidators` record. Nothing fails loudly if you skip it — the only symptom is another member's browser quietly going stale. Each event's `label` is required and decides whether it is also *activity*: the affected thing's display name to log it, `null` for a cascade or for chatter. A **patch** also carries `changes` from `changedColumns(existing, set)` — diffed against the normalized `set`, never the raw payload — and an empty diff means the save is not logged. A service that takes a diff returns `{ data, changeset }`, never the row with the diff spread into it. → `realtime-events`
7. **A paginated list returns `{ items, page, pageSize, total }`, and the pager renders from that response, never from the URL** — the two disagree exactly when rows are deleted under a reader on the last page. Every paginated `orderBy` ends with its `id`; anything reading such an endpoint directly (a cache patcher, an E2E helper) takes the envelope; and a picker asks for `MAX_PAGE_SIZE` rather than a page. → `server-conventions`
8. **Service methods take `householdId`, never `userId`**, and scope every query by it so ids from other households 404 rather than leak. Authorization lives in the routing layer. → `server-conventions`
9. **The server's non-relative imports are `package.json#imports`** (`#lib/dates`) — never `@/*`, and never re-add tsconfig `paths`. Keep `AppType` exported and `vercel.json`'s `outputDirectory` in place. → `server-build-and-imports`
10. **Read `packages/ui/src/core/index.ts` before writing any markup.** The kit is larger than it looks, and hand-rolling what it already ships is the fastest way to make this codebase worse. → `ui-conventions`
11. **Always use react-hook-form** with `zodResolver(<server model>)` and explicit `defaultValues` — never track field values with `useState`, even in a single-field dialog. → `ui-conventions`
12. **Key rows and lists by the record's own id** (`getRowId` for tables, `key={record.id}` for lists), never by index — an inline editor otherwise commits to whichever record took that position. → `ui-conventions`
13. **Destructive actions always confirm**, via `ConfirmDeleteDialog`, naming the specific thing being deleted. → `ui-conventions`
14. **Dates display and parse day-first** (`dd. MM. yyyy`). Never parse user input with `new Date(input)` — it reads `03. 07. 2026` as 7 March. → `ui-conventions`
15. **Every route with a loader needs both a `pendingComponent` and an `errorComponent`.** Without the second, one loader rejection replaces the entire app, sidebar included. → `web-conventions`
16. **Every user-facing feature ships with an E2E flow**, and E2E is how you verify — don't hand-drive the browser unless explicitly asked. Type-checking green is not evidence a feature works. → `e2e-testing`
17. **Before finishing, run all four**: `pnpm check-types`, `pnpm lint` (zero diagnostics), `pnpm knip`, `pnpm test`. Then run `pnpm test:e2e` **once** as the final gate — not while iterating. Report the result honestly: if it fails, say so with the output rather than declaring done.
18. **Never truncate or seed the dev database on :8765.** The E2E and unit suites own :8766 and :8767 and reset those themselves.
19. **Comments are short — one line, or none.** Write only what the code can't say itself: a live constraint or a trap. Not rationale essays, not the archaeology of how the code got here; the PR body and git history hold those. A comment that needs a paragraph is a sign the code needs the work instead.

## Keeping this file small

This file is a map plus the tripwires. **New detail goes in a skill**, not here — CLAUDE.md earns at
most a one-line non-negotiable and a routing-table row. A section here that grows past a few lines
belongs in a skill instead. When a convention is established in one PR, write it into the relevant
skill in that same pass; it then holds for every PR after.

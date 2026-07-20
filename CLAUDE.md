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

Domain-specific code that is reused across routes lives under `src/modules/<domain>/<mechanism>/<file>` — where `<mechanism>` is `components`, `hooks`, `queries`, `helpers`, etc. (e.g. `src/modules/households/components/add-member-forms.tsx`). Each mechanism folder exposes an `index.ts` barrel; import via `@/modules/<domain>/<mechanism>`. Keep route files thin — when the same domain component/hook/query appears in more than one route, extract it into the matching module folder rather than duplicating it. Route-local, single-use components stay co-located in the route's `-components/`.

### Shared UI (`packages/ui`)

ShadCN components built on Radix UI primitives + TailwindCSS v4. Add new components here when they are reused across routes.

### Database

Drizzle ORM + PostgreSQL. Schema files are in `apps/server/src/db/schema/`. After changing a schema file, run `db:migrations:create` then `db:migrations:apply`.

Better Auth manages its own tables (`user`, `session`, `account`). Domain tables live in separate schema files (e.g., `household.ts`).

## Key Conventions

- **Linting & formatting** are handled by [Biome](https://biomejs.dev/) via the root `biome.json` (single config, no per-package overrides).
- **Type-only imports** are enforced by Biome's `useImportType` (inline style: `import { type Foo }`).
- **Import organization** is enforced by Biome's `organizeImports` assist; unused imports/variables are auto-removed.
- Environment variables are validated at startup via `src/config/env.ts` (server) — add new vars there.
- The Hono `AppType` exported from `apps/server/src/index.ts` is the contract consumed by the web client — keep it exported.
- **Never hand-write request/response payload types on the web client.** Derive them from the Hono RPC client with `InferRequestType`/`InferResponseType` so they can't drift from the server contract. E.g. `type Payload = InferRequestType<typeof client.households.my.members[':id'].$patch>['json']` rather than `{ name?: string; nickname?: string }`. Same for response shapes consumed by tables/components.
- **Always use react-hook-form for forms and form fields** — never track field values with `useState`. Use `useForm` with `zodResolver(<server model>)`, explicit `defaultValues`, and the shared `Form`/`FormField`/`FormItem`/`FormControl`/`FormLabel`/`FormMessage` components from `@homewise/ui/core/form`. Reuse the exported Zod model that matches the endpoint (e.g. `patchHouseholdMemberModel`) as the resolver so validation and the request payload stay aligned. This applies even to single-field dialogs.

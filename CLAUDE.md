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
  eslint-config/   # Shared ESLint rules
  prettier-config/ # Shared Prettier config
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

# Linting & formatting
pnpm lint                       # ESLint all packages
pnpm format                     # Prettier format TS/TSX/MD

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

### Shared UI (`packages/ui`)

ShadCN components built on Radix UI primitives + TailwindCSS v4. Add new components here when they are reused across routes.

### Database

Drizzle ORM + PostgreSQL. Schema files are in `apps/server/src/db/schema/`. After changing a schema file, run `db:migrations:create` then `db:migrations:apply`.

Better Auth manages its own tables (`user`, `session`, `account`). Domain tables live in separate schema files (e.g., `household.ts`).

## Key Conventions

- **Type-only imports** are enforced by ESLint (`import type { ... }`).
- **Import alphabetization** is enforced; unused imports are auto-removed.
- Environment variables are validated at startup via `src/config/env.ts` (server) — add new vars there.
- The Hono `AppType` exported from `apps/server/src/index.ts` is the contract consumed by the web client — keep it exported.

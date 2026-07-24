#!/usr/bin/env bash
# Vercel build entrypoint for the server.
#
# Preview deployments get their own isolated Neon branch (via the Neon Postgres
# Previews integration), so it is safe — and necessary — to apply migrations and
# seed test data as part of the preview build. Neon branches previews off the
# production branch, so the branch starts as a copy of prod data; SEED_RESET=true
# tells the seed to wipe it first, giving an empty-then-seeded, deterministic DB.
# Production migrations are owned by the GitHub Actions pipeline
# (.github/workflows/deploy-production.yml), so the production build only
# compiles. DDL uses the unpooled/direct connection when available.
set -euo pipefail

if [ "${VERCEL_ENV:-}" = "preview" ]; then
  echo "▸ preview build: applying migrations + resetting & seeding preview branch"
  DATABASE_URL="${DATABASE_URL_UNPOOLED:-${DATABASE_URL:-}}" pnpm db:migrations:apply
  SEED_RESET=true DATABASE_URL="${DATABASE_URL_UNPOOLED:-${DATABASE_URL:-}}" pnpm db:seed
else
  echo "▸ ${VERCEL_ENV:-non-preview} build: skipping migrate/seed (owned by CI)"
fi

pnpm build

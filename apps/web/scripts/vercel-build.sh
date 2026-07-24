#!/usr/bin/env bash
# Web build entrypoint for Vercel.
#
# VITE_API_URL is supplied by the caller and baked in at build time by Vite:
#   - Preview: the GitHub Actions preview pipeline passes the matching server
#     preview alias via `vercel deploy --build-env VITE_API_URL=…`, so the web
#     app talks to its own PR's server. We never derive the server hostname here
#     (Vercel's 63-char DNS-label truncation makes that unreliable) — the CI run
#     deploys the server first and hands us the alias directly.
#   - Production: VITE_API_URL is the dashboard value (e.g. https://api.home-wise.app).
set -euo pipefail

# Hard-fail if the API URL is missing: a preview passes it via --build-env and
# production sets it in the dashboard, so an unset value here means the app would
# ship pointing at nothing. Better to fail the build than deploy a broken preview.
: "${VITE_API_URL:?VITE_API_URL must be set for Vercel builds}"

echo "▸ ${VERCEL_ENV:-non-preview} build: VITE_API_URL=${VITE_API_URL}"

# Build through Turbo (not `pnpm build`) so workspace deps are built first:
# `build` dependsOn `^build`, which compiles the server and emits the .d.ts that
# the web's type-check consumes via the RPC client. Turbo lists VITE_API_URL in
# build.env, so the value flows through and busts the cache per branch.
pnpm turbo run build --filter @homewise/web-app

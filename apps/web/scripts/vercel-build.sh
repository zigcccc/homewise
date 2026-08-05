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

# Vite only inlines VITE_-prefixed variables, so Vercel's own VERCEL_ENV/VERCEL_GIT_COMMIT_SHA have
# to be re-exported under names the bundle can see. Not hard-failing on either: a missing DSN just
# disables Sentry, which is the right outcome for a build that was never meant to report.
export VITE_SENTRY_ENVIRONMENT="${VERCEL_ENV:-development}"
export VITE_SENTRY_RELEASE="${VERCEL_GIT_COMMIT_SHA:-}"

# The auth token is the one Sentry variable worth failing over, and not because of the upload: it is
# what switches the build to hidden source maps that are deleted once they reach Sentry. Without it
# there is no upload to delete them, so a build that quietly carried on would either publish our
# source under `dist/assets` or — since vite.config.ts now refuses to emit maps it can't clean up —
# ship a release whose stack traces are unreadable minified frames. Both are worth stopping for.
: "${SENTRY_AUTH_TOKEN:?SENTRY_AUTH_TOKEN must be set for Vercel builds (it gates the source-map upload)}"

# Build through Turbo (not `pnpm build`) for the env contract: `envMode` is strict, so a variable
# reaches Vite only if `turbo.json`'s `build.env` names it — and being named is also what busts the
# cache per branch when VITE_API_URL changes. Nothing here needs a workspace dep built first; the
# server ships its source and the web resolves it directly.
pnpm turbo run build --filter @homewise/web-app

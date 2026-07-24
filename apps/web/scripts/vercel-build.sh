#!/usr/bin/env bash
# Web build entrypoint for Vercel.
#
# In preview deployments, point the app at the matching *server* preview instead
# of production. The web and server projects deploy previews for the same git
# branch, so they share the same branch + team slug — the server's branch URL
# differs from this web deployment's VERCEL_BRANCH_URL only by the project-name
# prefix. Deriving it from VERCEL_BRANCH_URL avoids hand-rolling Vercel's branch
# slugification. Production is untouched (VITE_API_URL stays the dashboard value,
# e.g. https://api.home-wise.app). Vite bakes VITE_API_URL in at build time.
set -euo pipefail

if [ "${VERCEL_ENV:-}" = "preview" ] && [ -n "${VERCEL_BRANCH_URL:-}" ]; then
  export VITE_API_URL="https://${VERCEL_BRANCH_URL/homewise-web/homewise-server}"
  echo "▸ preview build: VITE_API_URL=$VITE_API_URL"
else
  echo "▸ ${VERCEL_ENV:-non-preview} build: using configured VITE_API_URL"
fi

pnpm build

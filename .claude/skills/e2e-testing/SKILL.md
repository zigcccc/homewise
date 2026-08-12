---
name: e2e-testing
description: How Playwright E2E works on Homewise (apps/e2e) — the setup/parallel/exclusive project phases, Page Objects, the shared seed fixtures, the isolated test Postgres on :8766, E2E_WEB_MODE=dev, and the CI job. Use when adding or changing a spec, deciding where a new spec belongs, debugging a flaky or failing E2E run, or verifying that a feature works.
---

# End-to-end testing

Playwright drives the **real** app (web + server) end-to-end. Tests live in the dedicated
`@homewise/e2e` workspace — **not** inside `apps/web`. Read `CLAUDE.md` first — it wins on any
conflict; this skill is the detail behind its E2E tripwires.

**E2E is the default test layer**: anything reachable through the running app is covered here, and
the Vitest unit suite covers only what isn't (see the `unit-testing` skill for that boundary).

## Commands

```bash
pnpm test:e2e                              # Full suite. Boots server + web + an isolated test
                                           # Postgres (:8766), migrates + reset-seeds it, removes it after.
pnpm --filter @homewise/e2e test:ui        # Interactive Playwright UI (watch/debug)
pnpm --filter @homewise/e2e test:report    # Open the last HTML report
pnpm --filter @homewise/e2e db:test:up     # Start only the test Postgres (:8766)
pnpm --filter @homewise/e2e db:test:down   # Remove the test Postgres
```

## Structure

- `tests/*.spec.ts` are the specs; `tests/auth.setup.ts` is a `setup` project that logs the seed
  users in once and saves `storageState`, so specs start already authenticated. `pages/*.page.ts`
  are **Page Object Models** — selectors and actions live there so specs read as intent; `support/`
  holds config + `global-setup`/`global-teardown`.
- **Three project phases run in order** (`setup` → `parallel` → `exclusive`), sequenced by
  `dependencies`. Nearly everything belongs in `parallel`, which is `fullyParallel` — that's why
  specs must use uniquely-named rows. The handful that mutate a *shared seed row* (household name,
  user name, ownership) are quarantined into `serial-seed-mutations.spec.ts`, the single `exclusive`
  file, which runs alone at the end. Put a spec there only if it can't be made self-contained; a new
  spec needs no config change.
- **Fixtures are one source of truth**: the seeded user/household/member come from
  `apps/server/src/db/seed-fixtures.ts`, imported by both the seed and the tests via
  `@homewise/server/seed-fixtures`. Never hard-code seeded creds/names in a spec.
- **Selectors**: prefer role/label queries; add a `data-testid` only when semantics aren't enough.
  Make CRUD specs **self-contained** — create a uniquely-named row (e.g. `` `Thing ${Date.now()}` ``),
  assert, then remove it — so they're idempotent across reruns and never mutate the shared seed
  fixture.

A form control with no `<label>` still needs an accessible name — inline table cells are the case,
since the column header names the column, not the input. Locate them by that name; a spec matching a
*placeholder* is a sign the control has no accessible name at all (see `ui-conventions`).

## How the suite runs

- **The suite always runs the whole app locally — on a dev machine and on CI alike.** There is no
  "run against a deployed preview" mode. `globalSetup` stands up an isolated test Postgres (docker
  `postgres-test`, **:8766** — the dev DB on :8765 is never touched), migrates + reset-seeds it under
  `NODE_ENV=test`; `webServer` boots the Hono server plus the web app served as a **production
  build** (`vite build && vite preview`, since the dev server buckles under concurrent load);
  `globalTeardown` removes the container. Needs Docker.
- **`E2E_WEB_MODE=dev` runs the suite against the Vite dev server** instead of the production build.
  Reach for it when a change touches **mount/unmount lifecycles**: React StrictMode only
  double-invokes effects in development, so a component that tears down what it just set up passes
  the default mode and fails on `pnpm dev`. That exact bug shipped once — the Ably connection was
  closed by its own effect cleanup, so `pnpm dev` had no realtime while the whole suite was green.
  It's opt-in because the dev server is slower and buckles under concurrent load. Note the router
  devtools only exist in this mode, and `getByLabel` matches substrings: their match rows are
  labelled with serialized search params, so form-field locators must be scoped to
  `page.locator('form')` (see `recipes.page.ts` `formField`).
- **`reuseExistingServer` is `false`, deliberately.** The `env` block (`DATABASE_URL`,
  `HOMEWISE_DISABLE_EMAILS`) only applies to a process Playwright spawns itself, so adopting a
  running `pnpm dev` would silently point the whole suite at the **dev** DB — polluting real data and
  inventing failures from state the seed never resets. A busy :5173/:3000 now makes the run refuse to
  start instead. **Stop `pnpm dev` before running the suite.**
- **Emails are suppressed** in E2E via `HOMEWISE_DISABLE_EMAILS` (set in `playwright.config.ts`).
  Real Resend calls were rate-limited across workers and made the invite specs flaky; the specs
  assert on our own invite rows, not on delivery. The flag defaults to `false`, so preview and
  production are unaffected.
- **CI**: the `e2e` job lives in `.github/workflows/ci.yml` and runs exactly what a dev machine runs
  — full app on the runner, throwaway Postgres, no Neon and no deployed preview (that switch removed
  serverless cold starts and Neon round-trip latency as flake sources). It needs
  `BETTER_AUTH_SECRET`, `HOMEWISE_RESEND_API_KEY`, `HOMEWISE_FILES_READ_WRITE_TOKEN` and
  `HOMEWISE_ABLY_API_KEY`; the blob and Ably keys must be real — the photo specs upload for real, and
  the server refuses to boot without a broker. `DATABASE_URL` is **not** set on the job —
  `globalSetup`/`webServer` supply the test DB. Neon still backs the *deployed* preview
  (`preview.yml` migrates + seeds a per-PR branch during the server build), but no test touches it.
- **Not a turbo task** — run it directly (`pnpm test:e2e` = `pnpm --filter @homewise/e2e test`).
  Turbo adds nothing here: uncacheable, single package. Only `check-types` for the package goes
  through turbo.

## Adding a spec for a new feature

Every user-facing feature ships with an E2E flow. Cover the feature through the **real UI**:
create → appears in list → edit → search/sort → archive (when supported) → delete, plus the
validation failure path. Put selectors and actions in a Page Object
(`apps/e2e/pages/<feature>.page.ts`) and the assertions in `apps/e2e/tests/<feature>.spec.ts`,
mirroring `household-members.page.ts` / `household-members.spec.ts`.

If the feature's list is one a second member would sit and watch, extend `realtime.spec.ts` too: two
browser contexts in the same household, one acts, the other asserts **without reloading**.

Where a list has an inline editor, keep the spec that adds a row *above* an open editor mid-edit —
`ingredients.spec.ts` and `meal-plan.spec.ts` both have one, and they exist because keying rows by
index shipped as a bug twice.

## This is how you verify — not the browser

**Verify against the running app, not just the type-checker.** Boot the server and exercise the
endpoints, including the negative cases: wrong role, cross-household id, duplicate, malformed input.
Cover UI behavior with an **E2E flow**, not by hand-driving the browser — don't manually verify in
the browser unless the user explicitly asks (it's slow; the tests are fast and repeatable).
Type-checking passing is not evidence a feature works: a swallowed `onClick` and a US-vs-European
date parse both type-check fine. Clean up any test data you create.

**Run the full suite as the final gate — once, not continuously.** After `check-types`/`lint`/`knip`
are green, run `pnpm test:e2e` as the last step before telling the user you're done. Do **not** run
it repeatedly while developing — it's slow and needs Docker; it's a final verification, not an
inner-loop tool. Report the result honestly: if it fails, say so with the output rather than
declaring done.

**When a deliberate change makes a spec fail**, update the spec (or its Page Object) to the new
intended behavior — never delete it or `.skip` it just to go green. A red E2E on a PR is a required
signal, not noise. Locally, `test:report` opens the HTML report; on CI the report + traces upload as
an artifact on failure.

**Never intercept the network to cover an error branch.** Faking a response from our own API is
mocking something we own. An unhappy path that E2E can't reach either belongs in the Vitest layer or
stays uncovered by agreement — see `unit-testing`.

## Related skills

`unit-testing` for what E2E can't reach · `new-feature-module` for where the spec fits in a feature's
build order · `realtime-events` for two-context realtime specs.

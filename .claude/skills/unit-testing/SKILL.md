---
name: unit-testing
description: How unit tests work on Homewise — Vitest in apps/server and apps/web, what earns a unit test versus what stays E2E, the external-services-only mocking rule, and the real Postgres on :8767. Use when adding or changing a unit test, deciding whether something should be unit-tested at all, wiring a new package into the suite, or debugging a vitest worker that died on startup.
---

# Unit testing

Vitest covers `apps/server` and `apps/web`. Read `CLAUDE.md` first — it wins on any conflict.

**Playwright (`apps/e2e`) is still the default test layer** — see the `e2e-testing` skill. This one exists for what E2E can't
reach. Getting that boundary wrong in either direction is the main way this layer goes bad: unit
tests that re-cover what a spec already drives are maintenance for nothing, and logic left untested
because "there's no obvious place for it" usually means it's in the wrong place.

## Does this earn a unit test?

**Yes — three cases:**

1. **Parsing and formatting.** A clear input, a clear expected output, and usually a trap worth
   pinning: `moneyAmount` accepting 8.29 (a `multipleOf(0.01)` check rejects it), `parseDayFirst`
   reading `03. 07. 2026` as 3 July rather than 7 March, `parseAmount` returning `null` and never
   `NaN`.
2. **Defence paths no user can reach.** Code that exists to stop a bigger failure and that no
   realistic flow triggers — `isUniqueViolation` walking a `DrizzleQueryError` cause chain,
   `commitManagedImage` rolling back an upload when a concurrent delete removed the row,
   `cleanupOwnedImage` refusing to delete a shared avatar. This is the code most likely to be wrong,
   because nothing ever runs it.
3. **Client state logic with no network in it** — a hook's decisions, an optimistic cache write, or
   the cache helper it calls to make one (`arrangeItems`, `applyItemPatch`). This is the frame
   between the gesture and the refetch, which a spec only ever sees the far side of. Not the request
   itself; see the mocking rule.

**Never drive a third-party interaction library from a unit test.** dnd-kit resolves a cross-day move
off `source.manager`, a live drag operation carrying measured shapes and a pointer position. A
synthetic drop event doesn't have one, so `move()` returns the list untouched and the test passes
while proving nothing — which is exactly how a green test lies. Assert what the code does with the
*result*, and let the E2E suite prove a real drag arrives.

**No — and the "no" is a signal, not a refusal:**

- **A server route handler.** If a route holds logic E2E can't reach, that logic belongs in a
  service. Move it, then test the service.
- **A React component.** If a component holds logic worth testing, it belongs in a hook or a helper.
  Move it, then test that. `parseDayFirst` lived in `date-field.tsx` until it needed a test; it now
  sits in `modules/shared/helpers/dates.ts` beside `formatDate`, which is where its counterpart
  always belonged.

**When in doubt, ask whether a spec could drive it.** If yes, write the spec instead.

## The mocking rule

**Only external services may be mocked.** Resend, `@vercel/blob`, Ably, Sentry — things outside our
boundary that cost money, send mail, or need a network.

**Nothing we own is ever mocked.** Not the database, not a service, not a sibling helper, and **not
our own API**. A mocked collaborator tests the mock.

Two consequences fall out of that, and both are deliberate:

- **The DB is a real Postgres.** Not PGlite, not a stub. The paths worth covering assert on the *pg
  driver's error shape*, so a substitute engine would undermine exactly the tests it enables.
- **A hook's *request* is not unit-testable, but what surrounds it is.** Faking the response is
  mocking something we own; the decision to send it, and the optimistic cache write made before it,
  are ours and are exactly what E2E can't see. `use-meal-move.test.tsx` is the pattern: render with
  `renderHook` against a **real** `QueryClient`, read what the hook enqueued off
  `queryClient.getMutationCache().subscribe(...)` rather than off the network, and assert the cache.
  Set `retry: false` and let the request fail against no server. Pull the pure cores out too
  (`moveMealInRange`, `resolveMealMove`) — they carry most of the logic and need no DOM.

The `web` project runs every file in **jsdom**, set once in `apps/web/vitest.config.ts` — not per
file. A per-file `// @vitest-environment` docblock is easy to forget and fails as something that
looks nothing like a missing DOM, and the pure tests lose nothing by running in one.

Mock an external with `vi.mock` at the top of the file and say why in a comment — see
`images.service.test.ts`.

## Layout and commands

```
vitest.config.ts                    # root: lists the two projects
apps/server/vitest.config.ts        # project `server` — test.env, globalSetup, setupFiles
apps/server/vitest.global-setup.ts  # docker up :8767 → migrate → truncate; returns teardown
apps/server/vitest.setup.ts         # per-worker guard: DATABASE_URL must be the unit DB
apps/web/vitest.config.ts           # project `web` — jsdom environment, setupFiles
apps/web/vitest.setup.ts            # RTL cleanup after every test
```

`apps/web/vitest.config.ts` is **written fresh, not extended from `vite.config.ts`** — that config's
`tanstackRouter` plugin would regenerate `routeTree.gen.ts` on every test run.

```bash
pnpm test                                # everything (brings the unit Postgres up and removes it)
pnpm test:watch
pnpm exec vitest run --project server    # one project: `server` | `web`
pnpm exec vitest run src/lib/dates       # one file
```

Tests are **colocated** — `src/lib/dates.test.ts` beside `src/lib/dates.ts` — with one `*.test.ts`
convention whether or not the test touches the database. esbuild bundles only what `src/index.ts`
reaches, so they never enter `dist`.

`pnpm test` always starts the database. A warm `docker compose up -d --wait` costs about a second,
which is not worth splitting the server into two projects and two commands to avoid.

## The database

`postgres-unit` in `apps/server/docker-compose.yaml`: profile `unit`, container `homewise-unit-db`,
**port 8767**, database `homewise_unit`. Three databases, three ports, and they never meet:

| Port | What | Who resets it |
|---|---|---|
| 8765 | dev | nobody — **never truncate or seed it** |
| 8766 | E2E | `apps/e2e/support/global-setup.ts` (migrate + reset-seed) |
| 8767 | unit | `apps/server/vitest.global-setup.ts` (migrate + truncate, **never seeded**) |

Separate containers on separate ports, so neither suite can write into the other's data — and
neither can reach :8765. The unit DB is deliberately **not** seeded: unit tests build the rows they
need, so there are no fixtures to accidentally depend on.

**Isolation is unique-per-test data**, the same discipline the E2E specs use. A file that needs rows
creates its own household in `beforeAll` with a `randomUUID()` suffix and scopes everything to it —
see `stores.service.test.ts`. Files run in parallel; if that ever flakes, `fileParallelism: false`
on the server project is the lever, not a redesign.

### Adding a DB-touching test

1. `import { db, schema } from '#db/core'` and the service under test.
2. In `beforeAll`, insert a `user` then a `household` with a `randomUUID()` suffix in the name and
   email; keep the household id.
3. Scope every insert and query to that `householdId`, and give any name a unique suffix too.
4. Assert against the service, not against a mock of it.

Ask what the database is actually buying you. `stores.service.test.ts` is the model: it proves the
real driver raises an error shaped the way `isUniqueViolation` expects, which is precisely the thing
the hand-built cause chains in `db/utils.test.ts` are standing in for and cannot prove themselves.

## Two traps

**A dead worker means the environment, not the test.** `#config/env` validates on import and calls
`process.exit(1)` when it doesn't parse — vitest can only report that as a worker that died.
`apps/server/vitest.config.ts` sets `test.env` with every var it demands. Adding a required var to
`env.ts` means adding it there too, or the whole server project stops running. The credentials are
nonsense on purpose: a real key would only mean a test run could reach a real service.

**`vitest.setup.ts` refuses to run unless `DATABASE_URL` is the :8767 URL.** `env.ts` calls
`dotenv.config()`, so a worker's environment isn't purely what the config handed it. dotenv leaves
already-set keys alone, so the config wins today — the guard makes that a checked fact rather than a
trusted one. The failure it exists to prevent is a test suite truncating the dev database. If you
ever see it throw, fix the environment; do not weaken the guard.

## Writing the test

**Every case is named `it('should …')`.** No exceptions — "should" is what forces the name to state
an outcome rather than label a code path.

**GIVEN / WHEN / THEN comments go above the lines they describe**, so the three phases are visible
without reading the assertions:

```ts
it('should roll the new upload back when the row vanished mid-request', async () => {
  // GIVEN: a resolved picture change, whose replacement blob is already uploaded
  const { commit, rollback, update } = trackedUpdate();

  // WHEN: the write matches no row, because another member deleted the profile
  await expect(ImagesService.commitManagedImage(update, async () => false)).resolves.toBe(false);

  // THEN: the fresh blob should be dropped rather than left orphaned
  expect(rollback).toHaveBeenCalledOnce();
  expect(commit).not.toHaveBeenCalled();
});
```

Two ways that relaxes:

- **When setup, action and assertion are one expression, the three sit together at the top** — there
  are no separate lines to hang them on.
- **When the test is a single assertion whose name already says it, drop them.** Three comments
  restating `expect(formatMinutes(60)).toBe('1 h')` are noise. They earn their place when a test has
  structure, a non-obvious setup, or a "why" the name can't carry.

Write them about the *domain*, not the code: "the last day of January" beats "addDays is called with
2026-01-31". For `it.each`, they describe the table rather than one row.

- **Name the behaviour, not the function.** "should refuse to delete a shared avatar" beats "should
  return early".
- **Build fixtures that satisfy the real type.** A factory ending in `satisfies SomeResponse` — never
  `as unknown as SomeResponse`. The cast is what lets a fixture drift from the contract it claims to
  stand for, and it hides the compiler error that would have told you (a fixture using `name` where
  the response says `label` type-checked perfectly while testing nothing). Same for assertions: narrow
  with `instanceof` and throw, rather than casting the value into the shape you hoped for.
- **Comment the *why* where it isn't obvious**, and keep it to a live constraint. "The guard that
  matters: avatars are deduplicated, so several profiles point at one blob" earns its place; "calls
  del once" does not.
- **`it.each` for table cases** — accepted formats, rejected inputs, boundary values.
- **Prove a test has teeth before trusting it**: reintroduce the bug, watch it go red, revert. A
  test that passes against broken code is worse than no test.
- **Assert what's load-bearing.** Where behaviour is incidental or known-odd, either don't assert it
  or document it explicitly — `moveMealInRange`'s "renumbers position across the whole range rather
  than per day" test says in its comment that it documents rather than endorses, and names what
  should change if that's ever fixed.

## Adding a new package to the suite

Add `vitest` at `catalog:` to its `package.json`, write a `vitest.config.ts` with a `name`, and add
the path to `projects` in the root `vitest.config.ts`. Knip needs nothing — its Vitest plugin picks
up the config and the test files. `turbo.json` needs nothing either: this is not a turbo task, for
the same reason E2E isn't.

`packages/ui` is deliberately not in the suite. Its only non-component files are `cn` (two lines over
two well-tested libraries) and `useIsMobile` (needs a `matchMedia` stub for near-zero value). Wire it
up when something there earns a test, not before.

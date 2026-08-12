---
name: realtime-events
description: How Homewise realtime works end to end — c.var.emit(...) in every mutating withHousehold handler, the householdEventEntity union, the web's invalidators record, and the Ably client lifecycle traps (module-scope client, never close it, RealtimeSync re-authorizing on mount, the barrel that must not export the provider). Use when adding a mutating endpoint, wiring a new entity's invalidation, or debugging stale data in a second browser or tab.
---

# Realtime events (Ably pub/sub)

One story with two halves: the server emits, the web invalidates. Read `CLAUDE.md` first — it wins on
any conflict. For Ably SDK questions beyond our own wiring, see the `using-ably` skill.

`withHousehold` owns realtime dispatch: it exposes `c.var.emit(...)`, buffers what a request emits,
and publishes **one** batched message to the household's Ably channel after the handler succeeds.
Subscribers turn that into TanStack Query invalidations, so a member with the app open sees another
member's change without refreshing.

## Server: emit on every mutation

- **Every mutating handler under `withHousehold` calls `c.var.emit(...)`** — one call per distinct
  effect. `POST /recipes` emits `recipe` *and* `ingredient`, because saving a recipe also mints
  library rows; `POST /medical-info/:id/contacts` emits `contact` and `medical_info`. A handler that
  mutates and doesn't emit is a bug that only shows up as a stale second browser.
- The payload is `{ entity, id, parentId?, operation }` (`modules/realtime/realtime.model.ts`) —
  **never the entity itself**. `parentId` is only for entities the client caches under their parent
  (a dictionary entry's `dictionaryId`). Add an entity to the `householdEventEntity` enum and the
  web's `invalidators` record fails to compile until it's mapped.
- **Never derive a household id anywhere but `c.var.household`.** Channel names come from
  `RealtimeService.channelName`, and the token's capability is minted against that same string, so a
  tab is cryptographically confined to one household's channel — clients get `subscribe` only, never
  `publish`. Routes outside `withHousehold` (households, members, invites, `/users/me`) don't emit
  yet — `emit` is that middleware's context variable, so it doesn't exist there.
- Nothing is emitted when a request fails: a thrown `HTTPException` never reaches the flush, and a
  validator's 400 leaves `c.res.ok` false.
- `HOMEWISE_ABLY_API_KEY` is **required** — the server refuses to boot without it, like
  `DATABASE_URL`. There is deliberately no "run without realtime" path: a household whose members
  silently stop seeing each other's changes is broken in a way nobody reports. (A *runtime* publish
  failure is different — it's logged and swallowed, so the broker can never fail a mutation that
  already committed.) `HOMEWISE_REALTIME_NAMESPACE` prefixes every channel (`local`, `pr-27`,
  `production`, a per-run `test-…`); household ids repeat across databases, so without it one Ably
  app would deliver production events to a dev machine.

**Nothing fails loudly if you skip the emit** — the only symptom is a second member's browser quietly
showing stale data. A new mutating endpoint isn't done until it emits and its entity is mapped.

## Web: invalidation is the subscriber's only job

**Realtime invalidation is a second, passive path — it doesn't replace the mutation's own.**
`RealtimeProvider` (`src/modules/realtime`, mounted in `_onboarded`) subscribes to the household's
Ably channel and maps each event onto the *same* `invalidate*` helpers a mutation calls. So a new
domain needs (a) its helper, and (b) an entry in the `invalidators` record — which is keyed by the
server's entity union, so a missing one is a compile error, not a silent gap.

- **Keep invalidating locally in the mutation handler.** The acting tab is identified by `CLIENT_ID`
  (`src/api/client.ts`, sent as `x-homewise-client-id` on every request) and *skips* its own event,
  so it would otherwise never refresh at all. Realtime is for the other tabs.
- Realtime mappings may be **coarser** than the change (`['child-profiles']` rather than one id):
  `invalidateQueries` only refetches *mounted* queries, so a domain nobody is looking at costs
  nothing — which is why the event payload doesn't carry every affected id.

## The three client-lifecycle traps

All three have already shipped as bugs, and each has a spec holding it in place.

- **`modules/realtime`'s barrel exports queries only — never the provider.** `realtime.client.ts`
  constructs the Ably client at module scope, so *when that module is evaluated* is when the tab
  starts opening a connection. `_onboarded`'s `beforeLoad` imports the barrel for the channel query,
  so re-exporting the provider there drags the client into the main bundle and every signed-out
  visitor loads the SDK and hammers a token endpoint that can only 401. Keeping it out means
  `autoCodeSplitting` lands it in the route's component chunk instead. `realtime-bundling.spec.ts`
  fails if this is undone.
- **Nothing closes the Ably connection, and nothing should.** It's scoped to the tab, not to a
  component. `AblyProvider` captures the instance at render while StrictMode re-runs effects
  *without* re-rendering, so a cleanup that closes it leaves the re-run `useChannel` attaching to a
  dead client (error 80017). For the same reason the client is a module `const` rather than
  `useState(() => new Ably.Realtime(…))` — StrictMode calls that initializer twice and discards one
  instance, which would leak its socket (measured: 2 clients per page load vs 1).
- **Because that client outlives the household, `RealtimeSync` re-authorizes on every mount and
  `skip`s the channel until the new token resolves.** A token names one channel; swapping households
  (delete one, create another) moves the tab to a different one *and* remounts this component, so
  there's no previous value to diff against — "authorize when the prop changes" misses it entirely.
  An attach carrying the previous household's token is refused with `40160`, and Ably never retries a
  channel that failed that way, so the tab is deaf until a reload. `serial-seed-mutations.spec.ts`
  covers it with a household swap driven entirely through client-side routing; a spec that reaches
  the page via `page.goto` rebuilds the client and proves nothing.

Because StrictMode only double-invokes effects in development, a lifecycle regression here passes the
default E2E mode and fails on `pnpm dev`. Run the suite with `E2E_WEB_MODE=dev` when you touch any of
this — see `e2e-testing`.

## Testing it

If a feature's list is one a second member would sit and watch, extend `realtime.spec.ts`: two
browser contexts in the same household, one acts, the other asserts **without reloading**.

## Related skills

`server-conventions` for `withHousehold` · `web-conventions` for query keys and the `invalidate*`
helpers · `e2e-testing` · `using-ably` for the SDK itself.

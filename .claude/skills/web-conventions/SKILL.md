---
name: web-conventions
description: Conventions for apps/web — TanStack Router file-based routes, tabs as real nested routes, loader + pendingComponent + errorComponent, the Hono RPC client and deriving payload types from it, TanStack Query hierarchical keys and targeted invalidation, URL search params for list state, and the modules/<domain>/<mechanism> structure. Use when adding or changing any web route, loader, query, mutation or module.
---

# Web conventions

TanStack Router + TanStack Query over the Hono RPC client. Read `CLAUDE.md` first — it wins on any
conflict. For anything you *render* — components, forms, tables, dialogs — see `ui-conventions`.

## Routing

File-based routing. Route file conventions:

- `_layout.tsx` — layout wrapper (prefixed with `_`)
- `-components/` — co-located components not treated as routes (prefixed with `-`)
- `routeTree.gen.ts` — auto-generated, never edit manually

Route nesting reflects auth/onboarding requirements:

- `_authenticated/` — requires a valid session (redirects to `/login`)
- `_authenticated/_onboarded/` — requires an active household (redirects to `/onboarding`)

**Every route with a loader needs a `pendingComponent`** — use `<Spinner />` from `@homewise/ui/core`
(it fills its container; pass `className="min-h-dvh min-w-dvw"` for the full-viewport variant).

A spinner is right for a page whose shape is unknown until the data lands. **Where the layout is
fixed and its headings, icons and links need no request, render that instead** — the dashboard's
pending state is the real grid with `Skeleton` bodies. Keep the two from drifting by sharing the
frame rather than describing it twice: a `DashboardShell` for the page, and one
`const CARD = { … } satisfies DashboardCardFrame` per card feeding both the card and its skeleton
(see `_authenticated/_onboarded/-components/`). The `satisfies` is what puts a typo's error on the
declaration instead of at every spread site, and buys autocomplete inside the literal.

**A placeholder hangs off the component it stands in for** — `WeekMealsCard.Skeleton =
WeekMealsCardSkeleton`, exported as one name. The skeleton is then always to hand wherever the card
is, without a second import per card, and the pending state can't quietly reach for a skeleton whose
card it isn't rendering.

**And an `errorComponent`, scoped to that route** — `<RouteError title="…" />` from
`@/modules/shared`. Without one, a loader rejection (or a realtime refetch landing on a 404 because
another member deleted the thing) climbs to the root boundary and replaces the *entire app*, sidebar
included, with "Something went wrong!". Only the title is required: `icon`, `description` and the
action all have defaults, and the default action is a reload because most failures are a request that
didn't come back. Pass children where somewhere else is the better answer
(`shopping-lists/$listId.tsx` offers a link back). Where a subject can genuinely vanish, say so
specifically ("This list is gone"); where it can't, "Couldn't load X" is the honest title. A layout
route covers whatever renders into its `<Outlet />`, so an overlay route needs none of its own.

A route using `useSuspenseQuery` must also add a loader `ensureQueryData` alongside its
`pendingComponent`.

### Tabs are routes, not a search param

**Tabs (and any switch between distinct sub-views) are real nested routes, not a `?tab=` search
param.** Give the parent a `route.tsx` layout that renders the shared chrome (header, tab bar) plus
an `<Outlet />`, an `index.tsx` whose `beforeLoad` throws `redirect(...)` to the default tab, and one
route file per tab. Drive the active tab off `useMatchRoute`, and wrap each `TabsTrigger` (`asChild`)
around a `<Link>`. Each tab then owns *its own* loader and search params — e.g. the dictionary tab
keeps its `search`/`sort` params, the general tab carries none — instead of one route juggling a
`tab` param alongside every tab's state. See `family/kids/$profileId/`.

A search param is for ephemeral view state *within* a view (search/sort/filter); a route is for
*which* view you're on. (`manage/household-members` predates this and still uses a `?tab=` param —
migrate it to nested routes if you touch it.)

### List state lives in the URL

List/filter/sort state belongs in **URL search params** via `validateSearch` + `loaderDeps`, not
`useState` — so a filtered view is shareable and survives a refresh. Use `searchQueryParam` from
`@homewise/server/models` rather than a local copy, so the route validates against the same schema
the endpoint does.

**Every route sets its params through `useSearchParamSetter`** (`modules/shared/hooks`) — never a
local `navigate({ search: { ...searchParams, [key]: value }, to: '.' })`, which every list view had
its own copy of:

```ts
const setSearchParam = useSearchParamSetter(searchParams);

setSearchParam('type', 'family');
setSearchParam('search', term, { replace: true });
```

`replace` for a change not worth a history entry. A committed search term would otherwise be its own
entry, so Back walks the word backwards a few letters at a time instead of leaving the page; filters
and sorts still push. Pass the setter to a child component as `SearchParamSetter<SearchParams>`
rather than restating its signature.

**Searching is `SearchInput`** (`modules/shared`), never a hand-rolled `InputGroupInput` plus a
`useDebounceCallback`. It owns the debounce, the accessible name and — the part that is easy to get
wrong — keeping what is typed in sync with the URL. Feeding the input straight off the search param
lags a keystroke behind the debounce; holding it purely locally leaves a box claiming a filter the
list is not applying. **react-hook-form's `values` option is that trade**, not a pair of `useState`s:
it re-syncs the field when the param moves on its own (a Back button, a filter cleared elsewhere)
while typing stays ahead of the debounce.

Two traps live in that component, both covered by `search-input.test.tsx`:

- **`useDebounceCallback` rebuilds its debouncer whenever the callback identity changes, and leaves
  the previous one's timer running.** An inline `onChange` therefore fires against a search-param
  snapshot taken *before* the last filter click, silently dropping the filter. Keep what it closes
  over stable — a ref holding the latest handler — rather than letting the callback change.
- **A search box needs an `aria-label`.** A placeholder is not an accessible name; it disappears the
  moment anyone types, and a spec that can only find the control by placeholder is a spec proving it
  has no name. E2E locates these by role and name.

## The API client

API calls use the **Hono RPC client** (`src/api/client.ts`) initialized with `hc<AppType>()`, giving
fully type-safe request/response on the client. All requests use `credentials: 'include'` for session
cookie forwarding.

**Never hand-write request/response payload types.** Derive them from the RPC client with
`InferRequestType`/`InferResponseType` so they can't drift from the server contract. E.g.
`type Payload = InferRequestType<typeof client.households.my.members[':id'].$patch>['json']` rather
than `{ name?: string; nickname?: string }`. Same for response shapes consumed by tables and
components.

- **Narrow response types to the success status**: `InferResponseType<typeof $get, 200>`. Without the
  status argument the type unions in every declared error response, and property access collapses to
  `{}`.
- **`pnpm check-types` cannot tell you a type collapsed to `any`** — prove it with a throwaway probe
  that forces the compiler to speak. See `server-conventions` for the probe and the nesting-depth
  cause.

**Wrap RPC calls in `parseResponse`.** A `mutationFn` returning a raw Hono call swallows 4xx/5xx;
`parseResponse` makes errors throw so the mutation's error path actually runs.

**A switch over a wire union ends in `default: return assertNever(value)`** (`modules/shared`).
Leaving a case out is then a compile error naming it, rather than a `switch` that silently falls
through to `undefined`. It still runs, because the union came off the wire: a server shipping a new
enum value ahead of this build reaches it, logs through `console.error` (which is how we reach
Sentry — never `Sentry.logger.*`) and renders nothing instead of crashing the route.

## Data fetching

Data fetching uses **TanStack Query** with `queryOptions` helpers in a single
`<domain>.queries.ts` at the **module root**, beside `index.ts` — `src/modules/households/households.queries.ts`,
not a `queries/` folder. Queries are the one mechanism that isn't a folder (see Module structure
below); every module in the app follows this. Session is cached with a 5-minute stale time.

Query keys are hierarchical so prefix matching does the work: `['<domain>', 'list']`,
`['<domain>', id]`, `['<domain>', id, 'entries', queryParams]`. Including the params object in the
key caches each search/sort combination separately.

**Invalidation is targeted and never awaited.** Invalidate only the keys a mutation can actually
affect — `['<domain>', id]` already covers `['<domain>', id, 'entries', …]` by prefix, so listing it
separately is redundant. Use `exact: true` when you mean just that one key. The mutation has already
succeeded server-side, so `await`ing the refetch only makes the UI feel laggy; fire it with `void`.
Put helpers in the module (`invalidateDictionary(queryClient, id)`) and type the client as
`QueryClient`, not `ReturnType<typeof useQueryClient>`.

Those same `invalidate*` helpers are what the realtime subscriber calls — a new domain also needs an
entry in the `invalidators` record, which is a compile error until you add it. See `realtime-events`.

### Paging a list that grows without bound

Every list endpoint but one returns its table whole, which is fine for a household's contacts or
recipes. The activity log is the exception — it only ever grows — and is the one place with a cursor.
`activity.queries.ts` is the pattern to copy if a second ever needs one:

- **`infiniteQueryOptions`**, with `initialPageParam: undefined as number | undefined` and
  `getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined`. The page param is a **row id**,
  not an ordinal — the first page has none because it starts at the newest row — and `undefined`
  rather than `null` so it drops straight into the RPC query the endpoint declares.
- **The cursor is not in the query key** — only the filters are. It is the page pointer, and
  TanStack Query tracks it per page; putting it in the key gives every page its own cache entry.
- **Keyset, not offset**, which is the server's `readPage` (`server-conventions`). An offset would
  re-serve a row the moment anyone else wrote while a member was scrolling.
- **A card wanting the newest few uses its own plain `queryOptions`** with a `limit`, on its own key
  (`['activity', 'recent']`), so paging the full page can't disturb it. `ensureInfiniteQueryData` is
  the loader's call for the infinite one.

## Module structure

Domain-specific code that is reused across routes lives under `src/modules/<domain>/<mechanism>/<file>`
— where `<mechanism>` is `components`, `hooks`, `helpers` or `constants` (e.g.
`src/modules/households/components/add-member-forms.tsx`). Each mechanism folder exposes an `index.ts`
barrel; import via `@/modules/<domain>/<mechanism>`.

**Queries are the exception**: a module's `queryOptions` and `invalidate*` helpers go in one
`<domain>.queries.ts` at the module root, not in a `queries/` folder. There is a single file's worth
of them per domain, so a folder and a barrel would be a hop for nothing.

Keep route files thin — when the same domain component/hook/query appears in more than one route,
extract it into the matching module folder rather than duplicating it. Route-local, single-use
components stay co-located in the route's `-components/`.

App-specific shared code — reused across domains but meaningless outside this app — goes in
`src/modules/shared/<mechanism>/`, with the same barrel convention. The test: would another app want
this verbatim? If no, it belongs in `modules/shared`, not `packages/ui`.

Unlike the server, the web *does* use folder barrels, because `@/*` resolves a directory. Don't carry
the server's file-naming convention across — and don't carry this one back.

## Related skills

`ui-conventions` for anything rendered · `realtime-events` for the invalidation subscriber ·
`server-conventions` for the models a form's resolver comes from · `unit-testing` for what in a hook
earns a test (and why its request doesn't).

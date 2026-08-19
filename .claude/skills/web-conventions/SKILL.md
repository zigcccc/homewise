---
name: web-conventions
description: Conventions for apps/web — TanStack Router file-based routes, tabs as real nested routes, loader + pendingComponent + errorComponent, the Hono RPC client and deriving payload types from it, TanStack Query hierarchical keys and targeted invalidation, URL search params for list state, and the modules/<domain>/<mechanism> structure. Use when adding or changing any web route, loader, query, mutation or module.
---

# Web conventions

TanStack Router + TanStack Query over the Hono RPC client. Read `CLAUDE.md` first — it wins on any
conflict. For anything you *render* — components, forms, tables, dialogs — see `ui-conventions`.

## Capability

`useCan()` (`modules/shared/hooks/use-can.ts`) answers what the current member may do, over the same
`permissions.ts` the server enforces with. **It defaults to `'write'`** — inside the shell every role
reads everything it can reach, so a component asking about an area is asking whether it may change it.

- **It reads the household query, not route context.** `beforeLoad` results are cached per match, so a
  role changed in another tab — which arrives as a realtime invalidation of `['households']` — would
  leave every button on screen until the next navigation. Reading the query is reactive, denies while
  the role is unknown, and works in components that also render outside the shell (`add-member-forms`
  renders in onboarding, where there is no `_onboarded` match to read `from`).
- **Route context is still right for guards**, which run per navigation: `_onboarded`'s `beforeLoad`
  bounces a member out of a section they cannot read, and `requireWrite(area)` guards the three routes
  that only exist to write (`recipes/new`, `recipes/$recipeId/edit`, `shopping-lists/import`).
- **`NAV_GROUPS` (`modules/shared/constants/areas.ts`) is the only place a path is tied to an area.**
  The sidebar renders from it and the guard reads from it, so a section cannot appear in the nav
  without being reachable, or be reachable without appearing. `Settings` is gated on `write` rather
  than `read`, because the page is nothing but mutations.
- **An `external` member has its own home** (`/guest` — the role is `external` in the data, but the
  surface reads as "guest" to the person on it) rather than a filtered dashboard, and does
  **not** join the realtime channel — there is one channel per household and every event carries the
  display name of what changed, including things that role may not read.


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

**"Landing here sends you somewhere else" is a `beforeLoad` redirect, never a rendered `<Navigate>`.**
Read `search` and the query cache in `beforeLoad` and `throw redirect(...)`; a viewport check can go
there too (`isMobileViewport()` from `@homewise/ui/hooks`, the non-hook half of `useIsMobile`). The
difference only shows when the destination can bounce you back — `$listId` redirects out of a
completed list while the filter hides it — and then it decides between a loop and no loop. Two
redirects inside one navigation resolve against each other once; a rendered `<Navigate>` makes the
return trip a *fresh render* that fires the jump again, forever. It survived for a while on
react-router ≤1.170.27 only because an already-loaded route's `onPendingReady` happened to be
deferred a microtask; 1.170.28 correctly stopped deferring it and the bounce became infinite. The
shopping-list section is the worked example, and `serial-seed-mutations.spec.ts` covers it.

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
const setSearchParam = useSearchParamSetter(Route);

setSearchParam('type', 'family');
setSearchParam('search', term, { replace: true });
```

**It takes the `Route`, not a navigate function and not a type argument.** The keys and values come
off that route's own `validateSearch` (`Route['types']['fullSearchSchema']`), so an unknown key or a
value outside an enum is a compile error, and the navigation is bound to the route. Note the route's
search shape is *not* recoverable from `Route.useNavigate()`: `UseNavigateResult` carries the path
only as a **default** for a type parameter, which `infer` cannot reach, so it erases to `string`.
Pass the setter to a child component as `SearchParamSetter<typeof Route>`.

**It merges through `navigate`'s search *reducer*, never a spread of the current params** — that is
the load-bearing part, not a style choice. A spread captures the other params at the render that
built the setter, so any call that lands late writes that snapshot back wholesale: a debounced search
term firing after a filter click reinstates the params from before the click and silently drops the
filter. Reading them from the router at navigation time makes a stale call impossible rather than
something each caller has to defend against, and it makes the setter identity-stable as a side
effect. `use-search-param-setter.test.tsx` holds it, against a real memory-history router.

`replace` for a change not worth a history entry. A committed search term would otherwise be its own
entry, so Back walks the word backwards a few letters at a time instead of leaving the page; filters
and sorts still push.

**Setting anything other than `page` returns a paginated route to page 1** — the setter does it, so
no filter control has to remember to. Narrowing a list from page 9 otherwise asks for page 9 of a
result that may have two, and renders an empty table. Routes with no `page` in their schema are
untouched.

### A paginated list

A list route spreads `...pagedQueryParams().shape` into its `searchParamsModel` (from
`@homewise/server/models`, the same object the endpoint validates against), reads `data.items` for
its rows, and ends with `<ListPagination page={data} setSearchParam={…} />` from `modules/shared`.
`loaderDeps` already forwards the whole search object, so `page`/`pageSize` reach the query key and
the request with no extra wiring. Two things to get right:

- **The bar renders from the response, not the search params.** They disagree exactly when it
  matters — deleting the last page's rows leaves the URL asking for a page the server no longer has,
  and the server answers with the one it clamped to.
- **Optimistic cache patchers take the envelope**, not an array: `(page) => page && { ...page, items:
  page.items.map(…) }`. A patcher left mapping the response itself doesn't fail loudly — the inline
  edit just stops showing its new value until the refetch lands.

**An entity picker is `useAsyncOptions` + `AsyncComboboxContent`** (`modules/shared`), over that
domain's `list<X>OptionsInfiniteQueryOptions(search)`. The hook owns the search state, the debounce
and the paging; the shell owns the input, the loading row and the sentinel; the rows stay in the
picker, which is the only part that differs. Four rules hold it together:

- **Key it `['<domain>', 'options', { search }]`, never a `'list'` variant.** A prefix invalidator
  (`invalidate<X>`) still clears it — but `apply<X>Update` maps over `page.items` across every
  `['<domain>', 'list']` key, and handed an `InfiniteData` it reads `undefined` and writes a corrupt
  entry without failing. An invalidator that lists its sub-keys instead of taking the whole prefix
  (`invalidateRecipe`) must name `'options'` among them, or a rename leaves a stale trigger label.
- **The rows are a render prop**, `{(items) => …}`, called only when there are results — an empty
  `ComboboxGroup` otherwise leaves its heading hanging over nothing. Standing rows that must survive
  an empty search (a "None" row) go in `leading`, and terminal actions in `action`.
- **`enabled: open`**, so a picker nobody opened never fetches — which is what lets a route drop the
  loader that used to warm the list, and keeps 25 inline cells from being 25 requests.
- **`useInfiniteQuery`, never the suspense variant.** The popup renders its own loading row; a
  suspending query has no boundary nearer than the route's, so opening a picker would blank the page
  behind it.
- **A picker holding a value takes `{ id, name }`, not an id.** The trigger's label can no longer be
  looked up in a list that holds every row — the shop chosen months ago is not on page one. Inside a
  form that means the **choice itself is the field** (`store`, `category`), validated by the picker's
  own `<x>ChoiceModel` and mapped onto the payload's id/name halves at submit — not a `useState`
  beside `useForm` holding the label, which is the same field tracked twice.

A control that genuinely needs the whole list (a plain `Select` filter) still uses
`list<X>OptionsQueryOptions`, which asks for `MAX_PAGE_SIZE` and selects `.items`. Note
`ensureQueryData` in a loader returns the **raw page** — `select` only applies to a component's
`useQuery` — so a loader reading one destructures `{ items }` itself.

**Searching is `SearchInput`** (`modules/shared`), never a hand-rolled `InputGroupInput` plus a
`useDebounceCallback`. It owns the debounce, the accessible name and — the part that is easy to get
wrong — keeping what is typed in sync with the URL. Feeding the input straight off the search param
lags a keystroke behind the debounce; holding it purely locally leaves a box claiming a filter the
list is not applying. **react-hook-form's `values` option is that trade**, not a pair of `useState`s:
it re-syncs the field when the param moves on its own (a Back button, a filter cleared elsewhere)
while typing stays ahead of the debounce.

**A search box needs an `aria-label`.** A placeholder is not an accessible name; it disappears the
moment anyone types, and a spec that can only find the control by placeholder is a spec proving it
has no name. E2E locates these by role and name.

Worth knowing, because it looks like a bug the first time you read the code: `useDebounceCallback`
rebuilds its debouncer whenever the callback identity changes and never cancels the previous one, so
a re-render mid-typing can leave two timers pending. That is harmless *here* only because the setter
merges at navigation time — a late timer writes the right thing. Don't reach for a latest-handler ref
to tidy it up; if a debounced callback ever does need stability, fix what it closes over instead.

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

### Infinite scroll, on the same offset pagination

There is one pagination concept and it is an offset (`server-conventions`); an infinite scroll is
just a UI that keeps asking for `page + 1` and concatenates. The activity feed is the only one, and
`activity.queries.ts` is the pattern to copy:

- **`infiniteQueryOptions`**, `initialPageParam: { page: 1 }`, and `getNextPageParam` deriving
  "is there more" from `page * pageSize < total`.
- **The page param is not in the query key** — only the filters are. TanStack Query tracks the param
  per page; putting it in the key gives every page its own cache entry.
- **A feed that grows at the head carries an anchor.** Every mutation in the household writes an
  activity line, so an offset counting from a moving top repeats a row across a page boundary. The
  param carries a `maxId` — the newest id the *first* page saw — forward to every later page, and the
  server applies it as a filter.
- **The anchor is never on the first page**, and that is what keeps a realtime invalidation correct.
  On a refetch, `infiniteQueryBehavior` re-uses only the first page's stored param and recomputes
  every later one through `getNextPageParam` — so the first page comes back unanchored with the new
  rows in it, and the pages behind it re-anchor to the new top. Pinning `maxId` into
  `initialPageParam` would freeze the feed against live updates instead.
  `activity.queries.test.ts` covers the derivation.
- **A card wanting the newest few uses its own plain `queryOptions`** with a `pageSize`, on its own
  key (`['activity', 'recent']`), so paging the full page can't disturb it. `ensureInfiniteQueryData`
  is the loader's call for the infinite one.

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

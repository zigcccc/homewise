---
name: ui-conventions
description: Homewise UI patterns and the shared ShadCN kit in packages/ui — read the kit before hand-rolling markup, the Button wrapper-span and ComboboxTrigger traps, adding a shadcn component, PageLayout width rules, the full Empty composition, InlineCell/InlineTextField click-to-edit, table cells and getRowId, react-hook-form with the FormControl id trap, ConfirmDeleteDialog, and day-first dates. Use before writing or changing any component, form, table, cell, dialog or empty state.
---

# UI conventions

Read `CLAUDE.md` first — it wins on any conflict. For routes, loaders and queries see
`web-conventions`; this skill is everything that renders.

## Read-only forms

A form a member may not submit gets `<FormFieldset disabled={!canWrite}>` around its body rather than
a `disabled` on every control. One attribute disables every descendant, Radix triggers included, and
it never touches React props — so `FormControl`'s id/aria wiring is untouched and the `FormControl`
trap below does not apply. The submit disappears on its own: it renders on `formState.isDirty`, and a
disabled fieldset can never become dirty.

- **Use the kit's `FormFieldset`, never a bare `<fieldset>`.** It carries `contents`, which is
  load-bearing: a plain `<fieldset>` is a block box with `min-inline-size: min-content`, which breaks
  `space-y-*` rhythm and any grid or flex shrinking inside.
- **Watch what else is a `<button>`.** `MaskedInput` reveals its value with a pencil button, so a
  fieldset takes away the only way to read the value — pass `revealed={!canWrite || …}` so a read-only
  viewer sees it outright. Anything else whose *read* path runs through a button has the same problem.
- **Whole controls hide rather than disable** (`<Can>`): a row of greyed-out menu items is noise to
  someone who can never use them, and a disabled `DropdownMenuItem` inside a `TooltipTrigger asChild`
  swallows its own click.


## Read the kit before writing markup

`packages/ui` is ShadCN components built on Radix UI primitives + TailwindCSS v4. Add new components
there when they are **generic and app-agnostic** (Button, Dialog, Calendar, Spinner).

**Read `packages/ui/src/core/index.ts` before building any UI.** Hand-rolling something the kit
already ships is the most common way this codebase gets worse: a two-`Button` segmented toggle
shipped once where `Tabs` was already exported and already used for exactly that
(`modules/households/components/add-member-forms.tsx`). The same applies one level down — when a
layout fights you, check whether a sibling primitive already solves it before inventing markup
(`ComboboxFieldTrigger` exists because `SelectTrigger` had already solved label-left/chevron-right,
and reusing its class string got the box, focus ring and `aria-invalid` state for free — though not
its truncation and placeholder rules, which are keyed off `data-slot`/`data-placeholder` attributes
only Radix's own `Select` sets).

App-specific shared code — components/hooks/helpers reused across domains but meaningless outside
this app — goes in `apps/web/src/modules/shared/<mechanism>/` (e.g.
`modules/shared/components/confirm-delete-dialog.tsx`), with the same barrel convention as any other
module. The test: would another app want this verbatim? If no, it belongs in `modules/shared`, not
`packages/ui`.

### Two structural traps in the kit, both of which have already cost a bug

- **`Button` wraps all its children in one flex span** (for the `loading` overlay), so it has a
  single flex item: `justify-between` on a `Button` does nothing, and `truncate` on a label inside
  one can never fire. For a full-width, select-style trigger use `ComboboxFieldTrigger`, not a
  `Button`. That wrapper is also why the size variants match icon padding through
  `[data-slot=button-content]` as well as `>svg` — and why a loose `has-[svg]:` would be wrong, since
  it would catch the absolutely-positioned loading spinner and re-pad the button mid-request.
- **`ComboboxTrigger` vs `ComboboxFieldTrigger`** — the first is for an *action* that opens a picker
  ("Add ingredient"), the second is for a combobox used as a *form field*, and looks identical to a
  closed `Select`.

**A picker over API entities is server-searched and paged** — `useAsyncOptions` +
`AsyncComboboxContent` from `modules/shared`, never a `useMemo` filter over a fetched array. See
`web-conventions` for the query half. Four things about the kit parts it renders:

- **`ComboboxLoadMore` is a sentinel *and* a button**, and the button is not decoration: an
  observer fires on scroll, and nobody can arrow onto a sentinel to discover the list continues.
  Like `ComboboxAction` it stays outside cmdk's item registry, so it can't take Enter from the row
  the user meant. **Both stop Enter and Space from bubbling** (`keepKeyFromCommand`) — cmdk's root
  handler takes *every* Enter to select the highlighted item, so without it a focused button fires
  whichever row happened to be highlighted and closes the popup. Same root cause as the
  `place-autocomplete` Enter trap.
- **The page size has a floor.** The sentinel sits below `ComboboxList`'s `max-h-[300px]`, so a page
  that doesn't overflow that box leaves it visible on arrival and the list fetches itself to
  exhaustion. `OPTIONS_PAGE_SIZE` is 25 (~800px); anything under ~12 is not safe.
- **The search box gets an `aria-label`, not just a placeholder** — a placeholder is not an
  accessible name, and E2E locates every picker by role and name through `pages/picker.ts`.
- **The popup carries `data-search`**, the debounced term its rows answer. It exists for E2E:
  "nothing is loading" is also true in the window *before* the debounced request has started, so a
  spec waiting on the loading row alone can read the previous term's rows and click the wrong one.

**`cursor: pointer` is a base-layer rule** in `apps/web/src/main.css`, covering
`button:not(:disabled)` and `[role="button"]` — Tailwind v4's preflight is what set buttons to
`cursor: default`. A new raw `<button>` doesn't need the class, and `packages/ui` components keep
carrying their own `not-disabled:hover:cursor-pointer` because the package has to stand up in an app
that doesn't import this stylesheet.

### Adding a ShadCN component

Run `pnpm dlx shadcn@latest add <name>` from `packages/ui`, then correct what the CLI gets wrong:

- It prompts to overwrite existing files. **Never overwrite `button.tsx`** — it carries a custom
  `loading` prop and `not-disabled:hover` variants. The CLI is interactive and will hang in a
  non-interactive shell; expect to finish the job by hand.
- It writes pinned dep versions and pulls the unified `radix-ui` package. This repo uses
  per-component `@radix-ui/react-*` at `catalog:`. Add the version to `pnpm-workspace.yaml`'s catalog
  and reference `catalog:` in `package.json`.
- **It installs everything the registry lists, including deps the generated component never imports**
  — `calendar` pulls in `date-fns`, but the component only uses `react-day-picker` (which declares
  `date-fns` as its own dependency, not a peer). Check what the file actually imports before keeping
  a dep; `pnpm knip` will catch what you miss.
- Rewrite generated files to house style: relative `../lib/utils` import,
  `import { type ComponentProps } from 'react'`, alphabetized props.
- Export from `src/core/index.ts`, and add the dep to `apps/web/package.json` too if the app imports
  it directly (e.g. `date-fns`).

## Page layout and width

**Page width is constrained on the content, never on the page.** Every route renders into
`<PageLayout>` (`@/modules/shared`) — the `<main>`, carrying `flex-1 space-y-6 p-4` inside an
unconstrained `SidebarInset`. Don't hand-write that `<main>`: `flex-1` and the padding are invisible
from a route file, which is how they drifted (7 of 18 pages had picked up `space-y-4`). `PageLayout`
keeps the structural half fixed and leaves the rhythm overridable — pass `className="space-y-4"`
where a page wants the denser one, and nothing else. There is no page container and no `mx-auto`
anywhere. Where content would otherwise stretch uncomfortably wide, put a fractional cap on the block
itself — `lg:max-w-2/3` (kid/pet profile cards, the meal-plan day list) or `lg:max-w-1/2` (settings,
user profile). Headers, filter bars and toolbars stay full-bleed above it.

## Empty states

**An empty state is the full `Empty` composition, not a one-liner.** `EmptyHeader` + `EmptyMedia
variant="icon"` + `EmptyTitle` + `EmptyDescription`, and where there's an action to offer,
`EmptyContent` with a **default**-variant `Button` inside it — see `family/kids/index.tsx`. A bare
`<Empty>Nothing yet.</Empty>` with a ghost button next to it reads as unfinished beside every other
empty state in the app. Distinguish "nothing here yet" from "nothing matches your filter", and only
the first gets the create action.

## Tables and cells

**A cell takes the id it patches and the value it renders — never `info.row.original`.** Read the
value with `info.getValue()` and pass any extra fields by name (`<AmountCell amount={info.getValue()}
currency={…} id={…} paidBack={…} />`). Handing the whole row down because it's to hand is a code
smell: it hides what the cell actually depends on and re-renders it for changes to fields it never
reads. The one standing exception is the row-actions cell, whose delete dialog and menu labels
genuinely name the record — comment it where you use it.

**Build every table with `useDataTable`, never `useTable` directly** (`@homewise/ui/core`). It binds
the app's `features` and `getRowId` in one place. `getRowId` is why it exists: react-table's default
is the row *index*, which `DataTable` uses as React's key — so when the list changes, each row's
subtree keeps the state it had at that position while its props move on to a different record. An
inline editor then belongs to one row and writes to another: an open rename committed after a
realtime refetch renamed whichever ingredient took the old index. `ingredients.spec.ts` covers it by
adding a row above an open editor mid-edit. Don't pass `getRowId` at the call site — the hook owns it.

**Columns come from `createDataTableColumnHelper<Row>()`, wrapped in `columnHelper.columns([…])`.**
The helper binds the features type so a column file never names it. The `columns()` wrapper is not
optional dressing: a plain array widens every column's value type, and `useDataTable` then rejects it
outright — v9's `ColumnDef` is invariant in that parameter. Inside the wrapper each `info.getValue()`
stays typed as the field it reads.

**Column arrays must be reference-stable.** Module scope where they take no arguments, `useMemo`
where they do (with a `useCallback`'d handler, or the memo is defeated). A fresh array rebuilds the
column definitions on every realtime refetch and tears down any inline editor open at the time.

**An inline editor makes list identity load-bearing.** Key rows/cards by the record's own id
(`getRowId` for tables, `key={record.id}` for lists) and hold the editing flag *inside* the row
component. Keyed by position, an editor commits to whichever record later took that index — and
realtime refetches lists underneath open editors, so this happens without the user doing anything.
Both `ingredients.spec.ts` and `meal-plan.spec.ts` have a spec that adds a row above an open editor
mid-edit; keep them.

Table columns and row-action dialogs go in a co-located `-<feature>.config.tsx`, mirroring
`-household-members.config.tsx`.

We are on react-table **v9**. Ignore v8 answers found online — `useReactTable`, `getCoreRowModel` and
the `declare module` meta augmentation are all gone. The package ships its own reference:
`node_modules/@tanstack/react-table/skills/` and `.../table-core/skills/`, which is more precise than
the website.

**A paginated list ends with `ListPagination`** (`@/modules/shared`), which wraps the kit's
`DataTablePagination`. The bar takes plain props — page, size, total — rather than reading table
state, because sorting and filtering here are already server-side and live in the URL. That is also
why the shared `tableFeatures()` call in `data-table.tsx` is empty apart from its `columnMeta` slot —
no row model beyond the core one is ever built. A table that genuinely needs a client-side feature
registers it in that one shared call, not at its own call site; an unregistered feature doesn't fail
loudly, its methods are simply absent from the instance. That is also why the same bar sits under the
recipe **grid**, which has no table at all. See `web-conventions` for the route half.

`ListPagination` owns the stickiness (`sticky bottom-0 z-10 -mb-4 border-t bg-background`), not the
kit component and not the call sites — a bar that scrolls away is unusable at a page size of 100,
since reaching the control that turns the page means scrolling past every row on it first. Three
things that make it work, none of them obvious:

- **The scrollport is the `_onboarded` route's own div**, not the document, so `bottom-0` resolves
  against that. An `overflow-hidden` ancestor *inside* it would break the sticky; `SidebarInset`'s is
  outside and harmless.
- **`sticky`, never `fixed`** — it no-ops on a list that already fits, instead of reserving a strip
  over a half-empty table.
- **`-mb-4` cancels `PageLayout`'s bottom padding**, so the bar's resting position is the same as its
  stuck one and it doesn't lurch 16px as the last row scrolls in. That assumes `PageLayout`'s `p-4`,
  which every route has, tab routes included.

E2E asserts it with `toBeInViewport()` on a deliberately short viewport, plus `not.toBeInViewport()`
on the last row so the assertion can't pass on a list that never overflowed.

## Editing in place

**Editing in place beats a dialog for a field you can see.** `InlineTextField` (`@/modules/shared`)
is the shared editor: mount it only while editing so its `defaultValues` reseed, give it the single
field's zod schema lifted from the server model, and it handles commit-on-blur/Enter,
Escape-to-cancel and the three guards that make those safe (an exit `blur` re-submitting an abandoned
value; a server-refused value re-firing on every subsequent blur and trapping you in the field; an
unchanged value costing a request). That last guard runs **before** validation, not inside the submit
handler: an editor opened on an empty value — a brand-new entry — can never satisfy a `min(1)`
schema, and flagging a field nobody typed into as invalid is a complaint about a value the user never
entered. Pass `cancellable` where nothing on screen says Escape works.

Inline *select-like* controls — the ingredient category cell, the meal-plan member popover —
deliberately use **no** form: they're live controls with no submit and no field to hang a message on,
so they commit on change and toast on failure.

**A click-to-edit table cell is `InlineCell` (`@/modules/shared`), not a fresh copy of the pattern.**
It owns the editing flag, the resting button and the hidden max-content **sizer** that stops the
column resizing as the editor opens — an `<input>` reports a 20-character intrinsic width to an
auto-layout table regardless of `w-full`, which is why `InlineTextField` passes `size={1}` and why
something has to put the value's width back. The editor is *placed* into the sizer's grid cell
(`col-start-1 row-start-1` on a **wrapper**, because `InlineTextField`'s class lands on the input and
its form is `display: contents`); auto-placed it opens a second row and the row grows 22px on click.
`InlineCellSizer` is the same arrangement for a control that's always mounted, like the date cell.
Pass `fill` for free text, `maxWidthClassName` for a value with a natural length. The resting cell is
labelled by **what it does** (`Edit name`), uniformly — the amount cell's content is a currency
string, which is no way to name a control. For a cell whose value is *picked* rather than typed, pass
`inlineTriggerClassName` (same module) to the `SelectTrigger` or combobox — same bargain, one class
string, not a per-table copy.

## Forms

**Always use react-hook-form for forms and form fields** — never track field values with `useState`.
Use `useForm` with `zodResolver(<server model>)`, explicit `defaultValues`, and the shared
`Form`/`FormField`/`FormItem`/`FormControl`/`FormLabel`/`FormMessage` components from
`@homewise/ui/core/form`. Reuse the exported Zod model that matches the endpoint (e.g.
`patchHouseholdMemberModel`) as the resolver so validation and the request payload stay aligned. This
applies even to single-field dialogs.

- **A custom component used inside `FormControl` must not declare an `id` prop — it must forward
  one.** `FormControl` is a Radix `Slot` that clones its child with `id={formItemId}`, the id
  `FormLabel`'s `htmlFor` points at, plus `aria-describedby` and `aria-invalid`. Slot's `mergeProps`
  lets the **child's** props win, so a component with its own `id` overrides the generated one and
  detaches the label. `DateField` did this: four call sites hid it by passing `htmlFor` on the label
  by hand, and the one that forgot shipped a `<label>` attached to nothing. Spread the rest of the
  props onto the underlying input (`...inputProps`) and let the form wire it up. A control that sits
  *outside* a `Form` (the shopping-list import range) does take an explicit `id` with a matching
  `Label htmlFor` — that pairing is correct there.
- **A form control with no `<label>` still needs a name.** Inline table cells are the case: the
  column header names the column, not the input. Give them an `ariaLabel`, and locate them in E2E by
  that name. A spec matching a *placeholder* is a sign the control has no accessible name at all.
- **Don't reset form state in a `useEffect`.** Use a remount boundary instead — a dialog's form
  inside its `DialogContent`, or a `key` — so `defaultValues` reseed naturally.

**Tall forms portal a save into the Actionbar** when the form is dirty *and* the footer is out of
view (`useInView`): `order-last ml-auto`, `type="button"` + `handleSubmit`. Scope the E2E locator to
`page.locator('form')`.

**A dialog opened from inside a form is a sibling of `<form>`, never a child of it.** Radix portals
its content out of the DOM, but React still bubbles *synthetic* events up the **component** tree — so
a submit in the nested dialog also runs the outer form's `onSubmit`. Return a fragment holding
`<Form>…</Form>` and the dialog side by side (`LendItemDialog`, `ContactForm`'s relations section).
The same goes for any state the nested dialog needs: hold the picker's search term as
`{ name: string } | undefined` rather than a bare string, since an empty search is still a dialog
that has to open.

**A picker's "create new" row either defers or writes, and which one is forced by the payload.** A
value the parent's payload can carry by *name* (an ingredient, a shop) defers: the row hands back a
`{ kind: 'new', name }` and nothing is created until the parent saves, so an abandoned draft leaves
nothing behind — see `shouldOfferCreate` in `modules/shared/helpers/paged-query.ts`. A value stored
by **id** (a contact on a relation) cannot: there is nothing to point at until the row exists, so the
row opens a real create dialog and writes immediately. Don't reach for the deferred shape where the
foreign key rules it out — and pass the typed search down as the new record's name either way.

**A dialog that loads its own data catches its own suspense.** Wrap the body in
`<Suspense fallback={<Spinner className="min-h-64" />}>` inside `DialogContent`. Without it a
`useSuspenseQuery` — usually a combobox's options, several layers down — reaches the *route's*
boundary and puts the whole page behind the dialog into its loading state. It is invisible on the
page whose loader already warmed that query, and only shows up where the dialog is reused: the
expense dialog was fine on `/expenses/monthly-expenses` and blanked the dashboard. E2E can't pin
this — a modal marks the background `aria-hidden`, so a role-based locator can't even find the page
behind it, and the flash resolves before an auto-retrying assertion sees it.

## Destructive actions

**Destructive actions always confirm.** Use `ConfirmDeleteDialog` from `@/modules/shared`; name the
specific thing being deleted and mention the softer alternative (archive) when one exists.

**The one exception is an action that holds no content of its own and can be restored exactly** —
removing a meal from the plan is the only current case. It removes immediately with an Undo toast
(`toast.success(…, { action: { label: 'Undo', … } })`) that re-creates it from the fields already on
screen, position included. The bar is high: if Undo can't put back *everything* that was lost, it's a
confirm dialog. Don't extend this to recipes, profiles or households.

## Dates

**Display and parse day-first (European).** The display format is `dd. MM. yyyy`, matching the
tables. Never parse user input with `new Date(input)` — it reads `03. 07. 2026` as 7 March (US
month-first). Use date-fns `parse` against an explicit day-first format list; it also rejects
impossible dates like `31. 02.`. `parseDayFirst` and `formatDate` live in
`modules/shared/helpers/dates.ts`.

## One more menu trap

**A `TooltipTrigger asChild` around an enabled `DropdownMenuItem` swallows its `onClick`.** The
household-members table gets away with the pattern only because its items are disabled whenever the
tooltip content renders. For an always-enabled menu item, drop the tooltip.

## Related skills

`web-conventions` for routes, queries and module structure · `server-conventions` for the Zod models
a resolver reuses · `e2e-testing` for how the UI is verified.

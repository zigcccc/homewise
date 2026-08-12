import { expect, type Locator, type Page } from '@playwright/test';

import { API_URL } from '../playwright.config';
import { nameStartsWith } from '../support/text';
import { Drag } from './drag';

/** The household's shopping lists (`/food/shopping-lists`) — master column plus the open list. */
export class ShoppingListsPage {
  private readonly drag: Drag;

  constructor(private readonly page: Page) {
    this.drag = new Drag(page);
  }

  async goto() {
    await this.page.goto('/food/shopping-lists');
    await expect(this.page.getByRole('heading', { level: 1, name: 'Shopping lists' })).toBeVisible();
  }

  /**
   * Same destination through the sidebar rather than the address bar, so the tab keeps the JS context
   * it already had — a `goto` rebuilds the realtime client and would mask any bug in how a long-lived
   * one survives beneath it.
   */
  async openFromSidebar() {
    await this.page.getByRole('link', { name: 'Shopping lists', exact: true }).click();
    await expect(this.page.getByRole('heading', { level: 1, name: 'Shopping lists' })).toBeVisible();
  }

  /**
   * The master column's entry for a list, addressed by id.
   *
   * By id rather than by label on purpose: a list is labelled from its sections, so two specs
   * running in parallel routinely produce lists called the same thing. The id is the only handle
   * that belongs to one spec.
   */
  listLink(listId: string) {
    // Anchored on both ends, never `*=`: `…/1` is a prefix of `…/10`, so a substring match would find
    // other specs' rows. The `?` alternative is for the retained `includeCompleted` filter, which the
    // section carries onto its own links so a completed list can be opened at all.
    const path = `/food/shopping-lists/${listId}`;

    return this.page.locator(`a[href="${path}"], a[href^="${path}?"]`);
  }

  /**
   * Mints a list through the API and opens it.
   *
   * Through the API on purpose, for every spec that just needs *a* list of its own to work on. The
   * button-driven path below races the index route's auto-select: the page opens whichever list is
   * first, that navigation can land after the click, and the spec walks away holding another spec's
   * list — which it then finds already has its ingredient on it. `createListFromUi` still covers the
   * button, in the exclusive project where nothing else is creating lists at the same time.
   */
  async createList() {
    const response = await this.page.context().request.post(`${API_URL}/shopping-lists`, { data: {} });
    expect(response.ok(), 'could not create a shopping list').toBe(true);

    const listId = String((await response.json()).id);
    await this.openList(listId);

    return listId;
  }

  /**
   * Removes a list through the API, and fails if it didn't go.
   *
   * The counterpart to `createList`, for a spec that only needed a list to look at. `deleteListIfPresent`
   * drives the UI and returns `false` when the pane doesn't render in ten seconds — which under a
   * loaded run means a `finally` block can leave a list behind **silently**. That list then survives
   * into the `exclusive` project, whose shopping-list specs need "this household has no lists" as a
   * precondition, and the failure surfaces over there instead of here.
   */
  async deleteListViaApi(listId: string) {
    const response = await this.page.context().request.delete(`${API_URL}/shopping-lists/${listId}`);
    expect(response.ok(), `could not delete shopping list ${listId}`).toBe(true);
  }

  /**
   * Creates a list by clicking `New list`, waits for the detail pane to open on it, and returns its
   * id. Only safe where the household isn't being changed concurrently — see `createList`.
   *
   * Waits for the id to *change*, not merely for a detail URL: on a wide screen the index route
   * auto-selects the first list, so the URL already matches before the click and a plain
   * `waitForURL` would hand back whichever list happened to be open.
   */
  async createListFromUi() {
    // Every id already on screen, not just the one currently open. On a wide screen the index route
    // auto-selects a list, and that navigation can land *after* the click — so "wait for the id to
    // change" would happily return the auto-selected list, which belongs to another spec.
    const before = new Set(
      await this.page
        .locator('a[href^="/food/shopping-lists/"]')
        .evaluateAll((links) =>
          links.map((link) => /\/food\/shopping-lists\/(\d+)/.exec(link.getAttribute('href') ?? '')?.[1])
        )
    );
    before.add(this.currentListId());

    // `.first()` is the header row's button. The empty state has one too, and both are on screen
    // whenever the household has no lists — they do the same thing, so either would serve.
    await this.page.getByRole('button', { name: 'New list' }).first().click();
    await this.page.waitForURL((url) => {
      const id = /\/food\/shopping-lists\/(\d+)/.exec(url.pathname)?.[1];

      return id !== undefined && !before.has(id);
    });

    return this.listIdFromUrl();
  }

  /** The id of whichever list the detail pane is showing. */
  listIdFromUrl(): string {
    return this.currentListId()!;
  }

  private currentListId(): string | undefined {
    return /\/food\/shopping-lists\/(\d+)/.exec(this.page.url())?.[1];
  }

  /**
   * Opens a list by id, with the filter left at its default.
   *
   * Deliberately *not* `?includeCompleted=true`: that would leave every spec reached through here
   * running with the filter on, and "a list marked done drops out of the column" is then untestable.
   * `deleteListIfPresent` sets it, because that one does have to reach a finished list.
   */
  async openList(listId: string) {
    await this.page.goto(`/food/shopping-lists/${listId}`);
    await expect(this.page.getByRole('button', { name: 'List actions' })).toBeVisible();
  }

  /**
   * The import screen, over an explicit range. Driven by URL because the range lives in the search
   * params — which is the point of putting it there: a range is shareable and survives a refresh.
   */
  async gotoImport({ from, target, to }: { from: string; target?: string; to: string }) {
    const search = new URLSearchParams({ from, to, ...(target ? { target } : {}) });
    await this.page.goto(`/food/shopping-lists/import?${search.toString()}`);
    await expect(this.page.getByRole('heading', { level: 2, name: 'From the meal plan' })).toBeVisible();
  }

  /**
   * One row of the import preview, identified by its own include checkbox — the master column's
   * entries are `listitem`s too, and can carry the same words.
   */
  previewRow(name: string) {
    return this.page
      .getByRole('listitem')
      .filter({ has: this.page.getByRole('checkbox', { name: `Include ${name}` }) });
  }

  async excludeFromImport(name: string) {
    await this.page.getByRole('checkbox', { name: `Include ${name}` }).click();
    await expect(this.page.getByRole('checkbox', { name: `Include ${name}`, checked: true })).toHaveCount(0);
  }

  /**
   * Moves one end of the import range through the field, not through the URL.
   *
   * `gotoImport` would rebuild the page and prove nothing about what the range change does to a form
   * that is already mounted. The field takes day-first text, like every date in this app.
   */
  async setImportRange(end: 'from' | 'to', isoDay: string) {
    const [year, month, day] = isoDay.split('-');
    const input = this.page.locator(`#import-${end}`);

    await input.fill(`${day}. ${month}. ${year}`);
    await input.press('Enter');
    await expect(this.page).toHaveURL(new RegExp(`${end}=${isoDay}`));
  }

  /** Puts "Scale to who's eating" in the given state and waits for the amounts to follow. */
  async toggleScaling(on: boolean) {
    const toggle = this.page.getByRole('checkbox', { name: "Scale to who's eating" });
    const state = on ? 'checked' : 'unchecked';

    if ((await toggle.getAttribute('data-state')) !== state) {
      await toggle.click();
    }

    await expect(toggle).toHaveAttribute('data-state', state);
  }

  async confirmImport() {
    await this.page.getByRole('button', { name: /^Add \d+ items?$/ }).click();
    await this.page.waitForURL(/\/food\/shopping-lists\/\d+/);
  }

  /** A section heading in the open list. */
  section(label: string) {
    return this.page.getByRole('heading', { level: 2, name: label });
  }

  /**
   * The list's own groups. A `section` each — but so is sonner's toast region, and its toasts are
   * `listitem`s carrying the name of whatever they're reporting on ("Removed \"Onion\""), which is
   * exactly the text the row locators filter by.
   */
  private sections() {
    return this.page.locator('section').filter({ hasNot: this.page.locator('[data-sonner-toast]') });
  }

  /**
   * One row of the open list. Scoped inside a `section`, which only the list's own groups are — the
   * master column and the import preview are `listitem`s too, and an ingredient name can appear in
   * a list's inferred label.
   */
  item(label: string) {
    return this.sections().getByRole('listitem').filter({ hasText: label });
  }

  /**
   * The section an item sits under, read off the rendered order: each `section` element holds its
   * own heading and list, so this asks which section contains the row.
   */
  itemsUnder(sectionLabel: string) {
    return this.sections()
      .filter({ has: this.page.getByRole('heading', { level: 2, name: sectionLabel }) })
      .getByRole('listitem');
  }

  /** A section's `<ul>` — the drop target for a drag that isn't aimed at a particular row. */
  sectionList(sectionLabel: string) {
    return this.sections()
      .filter({ has: this.page.getByRole('heading', { level: 2, name: sectionLabel }) })
      .getByRole('list');
  }

  /** Items with no section render in the one `section` element that has no heading. */
  ungroupedItems() {
    return this.sections()
      .filter({ hasNot: this.page.getByRole('heading', { level: 2 }) })
      .getByRole('listitem');
  }

  /**
   * Puts one-off lines on a list through the API, for the specs that need *a lot* of them.
   *
   * Through the API because the picker is not what's under test there: driving it 25 times is 25
   * round trips through a popover for rows nothing asserts on individually.
   */
  async addOneOffsViaApi(listId: string, titles: string[]) {
    for (const title of titles) {
      const response = await this.page.context().request.post(`${API_URL}/shopping-lists/${listId}/items`, {
        data: { title },
      });
      expect(response.ok(), `could not add "${title}"`).toBe(true);
    }
  }

  /**
   * Adds an existing library ingredient — the server files it under that ingredient's shop.
   *
   * Matched on the option's own name span rather than its accessible name: each row also renders a
   * category badge, so the accessible name is "Onion Produce" and an exact match on "Onion" finds
   * nothing.
   */
  async addIngredient(name: string) {
    await this.openAddPicker();
    await this.page
      .getByRole('option')
      .filter({ has: this.page.getByText(name, { exact: true }) })
      .click();
    await expect(this.item(name)).toBeVisible();
  }

  /** Adds a name the library doesn't have: a one-off that must not join the ingredient library. */
  async addOneOff(name: string) {
    await this.openAddPicker();
    await this.page.getByPlaceholder('Search ingredients').fill(name);
    await this.page.getByRole('button', { name: `Add as a one-off "${name}"` }).click();
    await expect(this.item(name)).toBeVisible();
  }

  async openAddPicker() {
    await this.page.getByRole('button', { name: /^Add item/ }).click();
    await expect(this.page.getByPlaceholder('Search ingredients')).toBeVisible();
  }

  /**
   * `click`, not `check`: the checkbox is controlled by the server's response, so it doesn't flip
   * the instant it's clicked. `check()` verifies the state itself and clicks again when it hasn't
   * changed yet — which toggles it straight back. The assertion belongs in the spec instead.
   */
  async tick(label: string) {
    await this.page.getByRole('checkbox', { name: `Tick ${label}` }).click();
    await expect(this.isTicked(label)).toBeVisible();
  }

  async untick(label: string) {
    await this.page.getByRole('checkbox', { name: `Tick ${label}` }).click();
    await expect(this.isTicked(label)).toHaveCount(0);
  }

  isTicked(label: string) {
    return this.page.getByRole('checkbox', { name: `Tick ${label}`, checked: true });
  }

  /** One row's actions menu. Exact, or "Actions for Onion" also matches "Actions for Onion soup". */
  async openItemMenu(label: string) {
    await this.page.getByRole('button', { exact: true, name: `Actions for ${label}` }).click();
  }

  async removeItem(label: string) {
    await this.openItemMenu(label);
    await this.page.getByRole('menuitem', { name: 'Remove item' }).click();
    await expect(this.item(label)).toHaveCount(0);
  }

  /**
   * Takes the Undo on the toast a removal leaves behind, and waits for the row to come back.
   *
   * Scoped to the toast naming this item: removals stack, and two toasts each carrying an `Undo`
   * make a bare role query ambiguous — which Playwright retries until both have expired.
   */
  async undoRemoval(label: string) {
    await this.page
      .getByRole('listitem')
      .filter({ hasText: `Removed "${label}"` })
      .getByRole('button', { name: 'Undo' })
      .click();
    await expect(this.item(label)).toBeVisible();
  }

  /** Opens a row's amount editor and leaves it open — for the specs that assert on it mid-edit. */
  async openItemEditor(label: string) {
    await this.openItemMenu(label);
    await this.page.getByRole('menuitem', { name: 'Edit amount' }).click();
    await expect(this.quantityField()).toBeVisible();
  }

  /**
   * The other way in, which must work the same whether the row is an ingredient or a one-off.
   *
   * Anchored, not exact: the label button's accessible name picks up the amount beside it
   * ("Onion 2 kg"), while the row's other two buttons — "Move Onion", "Actions for Onion" — carry
   * the name in the middle, so a loose match would find three buttons.
   */
  async openItemEditorByName(label: string) {
    await this.item(label)
      .getByRole('button', { name: nameStartsWith(label) })
      .click();
    await expect(this.quantityField()).toBeVisible();
  }

  quantityField() {
    return this.page.getByRole('spinbutton', { name: 'Quantity' });
  }

  /** Commits the open row editor. It closes on success, which is what the wait is for. */
  async saveItemEdit() {
    await this.page.getByRole('button', { exact: true, name: 'Save' }).click();
    await expect(this.quantityField()).toHaveCount(0);
  }

  async editItem(label: string, { note, quantity, unit }: { note?: string; quantity: number; unit: string }) {
    await this.openItemEditor(label);
    await this.quantityField().fill(String(quantity));

    await this.page.getByRole('combobox', { name: 'Unit' }).click();
    await this.page.getByRole('option', { exact: true, name: unit }).click();

    if (note !== undefined) {
      await this.page.getByRole('textbox', { name: 'Note' }).fill(note);
    }

    await this.saveItemEdit();
  }

  /**
   * The pointer path onto `target`, which shares no code with `moveItem` below — a broken drag would
   * otherwise sail straight past the menu-driven spec.
   */
  async dragItem(label: string, target: Locator) {
    await this.drag.onto(this.page.getByRole('button', { exact: true, name: `Move ${label}` }), target);
  }

  /** Files a row under a different heading. `destination` is a section label, or "No section". */
  async moveItem(label: string, destination: string) {
    await this.openItemMenu(label);
    await this.page.getByRole('menuitem', { name: 'Move to' }).click();
    await this.page.getByRole('menuitem', { exact: true, name: destination }).click();
  }

  /** The "3 of 12 ticked" line under the open list's title — the master column shows it too. */
  progress() {
    return this.page.getByTestId('list-progress');
  }

  /**
   * Marks the list done. With items still unticked a three-way dialog appears; `choice` picks one.
   * With everything ticked there is nothing to decide and the list completes straight away.
   */
  async markDone(choice?: 'Finish anyway' | 'Move to a new list') {
    await this.page.getByRole('button', { name: 'Mark done' }).click();

    if (choice) {
      const dialog = this.page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: choice }).click();
      await expect(dialog).toBeHidden();
    }
  }

  /** The three-way dialog itself, for the spec that asserts what it offers. */
  async openMarkDoneDialog() {
    await this.page.getByRole('button', { name: 'Mark done' }).click();

    return this.page.getByRole('dialog');
  }

  /**
   * `click` rather than `check`, for the same reason as `tick`: this checkbox's state comes from the
   * URL, so it only flips once the navigation lands. `check()` would see it unchanged and click
   * again, toggling it straight back.
   */
  async showCompleted(show: boolean) {
    const toggle = this.page.getByRole('checkbox', { name: 'Show completed' });

    if ((await toggle.getAttribute('aria-checked')) === String(show)) {
      return;
    }

    await toggle.click();
    await this.page.waitForURL((url) => url.searchParams.has('includeCompleted') === show);
  }

  async addSection(name: string) {
    await this.openListMenu();
    await this.page.getByRole('menuitem', { name: 'Add section' }).click();
    const input = this.page.getByRole('textbox', { name: 'Section name' });
    await input.fill(name);
    await input.press('Enter');
    await expect(this.section(name)).toBeVisible();
  }

  async deleteList() {
    await this.openListMenu();
    await this.page.getByRole('menuitem', { name: 'Delete list' }).click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Delete list' }).click();
    await expect(dialog).toBeHidden();
  }

  /**
   * Best-effort cleanup: opens the list by id and removes it if it's still there.
   *
   * The `waitFor` matters. `goto` resolves on document load, but the detail pane only appears once
   * the route loader has resolved — and `count()`/`isVisible()` don't auto-wait like `expect` does.
   * Without it this read 0 every time and silently skipped the delete, leaving a list behind for
   * every spec in the run.
   */
  async deleteListIfPresent(listId: string) {
    // `includeCompleted=true`, or a finished list redirects out before it can be deleted.
    await this.page.goto(`/food/shopping-lists/${listId}?includeCompleted=true`);

    const actions = this.page.getByRole('button', { name: 'List actions' });
    await actions.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {
      // Genuinely gone — the spec deleted it itself, or a previous run cleaned up.
    });

    if (!(await actions.isVisible())) {
      return false;
    }

    await this.deleteList();

    return true;
  }

  /**
   * Removes every list the household still has, and leaves the page on the (now empty) column. Only
   * for the exclusive project, where one spec needs "no lists exist" as a precondition and owns the
   * household while it runs.
   *
   * Through the API, for the same reason `createList` is: this is a **precondition**, not the
   * behaviour under test — deleting a list through the UI has its own spec.
   *
   * It used to scrape the master column instead, and that was racy in a way that only showed up
   * under load. `showCompleted` waits for the URL, and the refetch it triggers lands *after* that —
   * the same trap `sortBy` documents. So with a completed list in the household and none open, the
   * scan read the still-unfiltered column, found no ids, and reported the household clean; the
   * completed list then rendered a moment later, and the failure landed on whichever assertion came
   * next rather than here.
   */
  async deleteAllLists() {
    // `includeCompleted`, or a finished list is invisible to this and survives the "clean" household.
    const response = await this.page.context().request.get(`${API_URL}/shopping-lists?includeCompleted=true`);
    expect(response.ok(), 'could not read the shopping lists').toBe(true);

    for (const list of (await response.json()) as { id: number }[]) {
      await this.deleteListViaApi(String(list.id));
    }

    await this.goto();
  }

  private async openListMenu() {
    await this.page.getByRole('button', { name: 'List actions' }).click();
  }

  /**
   * The master column, which steps aside on a phone once a list is open.
   *
   * The `<aside>` itself (role `complementary`), not the `<h1>` — the heading lives in the page
   * header row now, which stays visible in both panes.
   */
  masterColumn() {
    return this.page.getByRole('complementary');
  }

  /** The column the open list renders into. Its own scrollport from `md` up. */
  detailColumn() {
    return this.page.getByTestId('list-detail-pane');
  }

  /** How far a column has been scrolled. `0` for one that doesn't scroll at all. */
  async scrollTopOf(column: Locator) {
    return column.evaluate((element) => element.scrollTop);
  }

  /** Scrolls a column to its bottom, and waits for it to actually have moved. */
  async scrollToBottom(column: Locator) {
    await column.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
    await expect.poll(async () => this.scrollTopOf(column)).toBeGreaterThan(0);
  }

  backToAllLists() {
    return this.page.getByRole('link', { name: 'All lists' });
  }
}

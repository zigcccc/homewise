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

  /** Through the sidebar, so the tab keeps its JS context — a `goto` rebuilds the realtime client. */
  async openFromSidebar() {
    await this.page.getByRole('link', { name: 'Shopping lists', exact: true }).click();
    await expect(this.page.getByRole('heading', { level: 1, name: 'Shopping lists' })).toBeVisible();
  }

  /** By id, not label: a list is labelled from its sections, which collide across parallel specs. */
  listLink(listId: string) {
    // Anchored both ends: `…/1` is a prefix of `…/10`. The `?` form carries the `includeCompleted`
    // filter, without which a completed list can't be opened at all.
    const path = `/food/shopping-lists/${listId}`;

    return this.page.locator(`a[href="${path}"], a[href^="${path}?"]`);
  }

  /**
   * Mints a list through the API and opens it — for any spec that just needs one to work on. The
   * button path races the index route's auto-select; `createListFromUi` covers it in the exclusive
   * project.
   */
  async createList() {
    const response = await this.page.context().request.post(`${API_URL}/shopping-lists`, { data: {} });
    expect(response.ok(), 'could not create a shopping list').toBe(true);

    const listId = String((await response.json()).id);
    await this.openList(listId);

    return listId;
  }

  /**
   * The counterpart to `createList`, and it fails loudly. `deleteListIfPresent` drives the UI and
   * gives up silently under load, leaving a list behind for the exclusive project to trip over.
   */
  async deleteListViaApi(listId: string) {
    const response = await this.page.context().request.delete(`${API_URL}/shopping-lists/${listId}`);
    expect(response.ok(), `could not delete shopping list ${listId}`).toBe(true);
  }

  /**
   * Clicks `New list` and returns the new id. Only safe where nothing else is creating lists — see
   * `createList`.
   */
  async createListFromUi() {
    // Every id on screen, not just the open one: the index route's auto-select can land *after* the
    // click, so "wait for the id to change" would hand back another spec's list.
    const before = new Set(
      await this.page
        .locator('a[href^="/food/shopping-lists/"]')
        .evaluateAll((links) =>
          links.map((link) => /\/food\/shopping-lists\/(\d+)/.exec(link.getAttribute('href') ?? '')?.[1])
        )
    );
    before.add(this.currentListId());

    // `.first()` is the header row's button; the empty state has an identical one.
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
   * Opens a list with the filter at its default — not `?includeCompleted=true`, or "a list marked
   * done drops out of the column" becomes untestable for every spec reached through here.
   */
  async openList(listId: string) {
    await this.page.goto(`/food/shopping-lists/${listId}`);
    await expect(this.page.getByRole('button', { name: 'List actions' })).toBeVisible();
  }

  /** The import screen, over an explicit range — which lives in the search params. */
  async gotoImport({ from, target, to }: { from: string; target?: string; to: string }) {
    const search = new URLSearchParams({ from, to, ...(target ? { target } : {}) });
    await this.page.goto(`/food/shopping-lists/import?${search.toString()}`);
    await expect(this.page.getByRole('heading', { level: 2, name: 'From the meal plan' })).toBeVisible();
  }

  /** By its own checkbox: the master column's entries are `listitem`s too. */
  previewRow(name: string) {
    return this.page
      .getByRole('listitem')
      .filter({ has: this.page.getByRole('checkbox', { name: `Include ${name}` }) });
  }

  async excludeFromImport(name: string) {
    await this.page.getByRole('checkbox', { name: `Include ${name}` }).click();
    await expect(this.page.getByRole('checkbox', { name: `Include ${name}`, checked: true })).toHaveCount(0);
  }

  /** Through the field, not the URL: `gotoImport` rebuilds the page and proves nothing about a mounted form. */
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

  /** The list's own groups. Sonner's toast region is a `section` too, holding matching text. */
  private sections() {
    return this.page.locator('section').filter({ hasNot: this.page.locator('[data-sonner-toast]') });
  }

  /** Scoped to a `section`: the master column and the import preview hold `listitem`s too. */
  item(label: string) {
    return this.sections().getByRole('listitem').filter({ hasText: label });
  }

  /** The section an item sits under, read off the rendered order. */
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

  /** Bulk one-offs through the API — the picker isn't what's under test where this is used. */
  async addOneOffsViaApi(listId: string, titles: string[]) {
    for (const title of titles) {
      const response = await this.page.context().request.post(`${API_URL}/shopping-lists/${listId}/items`, {
        data: { title },
      });
      expect(response.ok(), `could not add "${title}"`).toBe(true);
    }
  }

  /** Matched on the name span, not the accessible name — a category badge makes that "Onion Produce". */
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

  /** `click`, not `check`: the state comes from the server, so `check()` clicks twice and toggles back. */
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

  /** Scoped to the toast naming this item: removals stack, and two `Undo`s are ambiguous. */
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

  /** Anchored, not exact: the label button reads "Onion 2 kg", and two sibling buttons carry the name too. */
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

  /** Shares no code with `moveItem`, or a broken drag sails past the menu-driven spec. */
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

  /** With items still unticked a three-way dialog appears; `choice` picks one. */
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

  /** `click`, not `check`, as with `tick` — this state comes from the URL and lands a beat later. */
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
   * Best-effort cleanup. The `waitFor` is required: `isVisible()` doesn't auto-wait, so without it
   * this reads 0 before the loader resolves and skips the delete.
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
   * Empties the household, for the exclusive project's "no lists exist" precondition. Through the
   * API, not the column: `showCompleted` only waits for the URL, so a scan can read the unfiltered
   * column and call the household clean a beat before a completed list renders.
   */
  async deleteAllLists() {
    // `includeCompleted`, or a finished list survives the "clean" household.
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

  /** The `<aside>`, not the `<h1>` — the heading lives in the header row and shows in both panes. */
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

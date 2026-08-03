import { expect, type Locator, type Page } from '@playwright/test';

/** The household's shopping lists (`/food/shopping-lists`) — master column plus the open list. */
export class ShoppingListsPage {
  constructor(private readonly page: Page) {}

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
  listLink(listId: string): Locator {
    // Exact href, not a substring: `…/1` is a prefix of `…/10`, so `*=` would match other specs' rows.
    return this.page.locator(`a[href="/food/shopping-lists/${listId}"]`);
  }

  /**
   * Creates a list, waits for the detail pane to open on it, and returns its id.
   *
   * Waits for the id to *change*, not merely for a detail URL: on a wide screen the index route
   * auto-selects the first list, so the URL already matches before the click and a plain
   * `waitForURL` would hand back whichever list happened to be open — another spec's, in parallel.
   */
  async createList(): Promise<string> {
    const before = this.currentListId();
    await this.page.getByRole('button', { name: 'New list' }).click();
    await this.page.waitForURL((url) => {
      const id = /\/food\/shopping-lists\/(\d+)/.exec(url.pathname)?.[1];

      return id !== undefined && id !== before;
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

  async openList(listId: string) {
    await this.page.goto(`/food/shopping-lists/${listId}`);
    await expect(this.page.getByRole('button', { name: 'List actions' })).toBeVisible();
  }

  /** A section heading in the open list. */
  section(label: string): Locator {
    return this.page.getByRole('heading', { level: 2, name: label });
  }

  /** One row of the open list. Scoped to `listitem` so a section heading can't match instead. */
  item(label: string): Locator {
    return this.page.getByRole('listitem').filter({ hasText: label });
  }

  /**
   * The section an item sits under, read off the rendered order: each `section` element holds its
   * own heading and list, so this asks which section contains the row.
   */
  itemsUnder(sectionLabel: string): Locator {
    return this.page
      .locator('section')
      .filter({ has: this.page.getByRole('heading', { level: 2, name: sectionLabel }) })
      .getByRole('listitem');
  }

  /** Items with no section render in the one `section` element that has no heading. */
  ungroupedItems(): Locator {
    return this.page
      .locator('section')
      .filter({ hasNot: this.page.getByRole('heading', { level: 2 }) })
      .getByRole('listitem');
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

  private async openAddPicker() {
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

  isTicked(label: string): Locator {
    return this.page.getByRole('checkbox', { name: `Tick ${label}`, checked: true });
  }

  async removeItem(label: string) {
    await this.page.getByRole('button', { name: `Remove ${label}` }).click();
    await expect(this.item(label)).toHaveCount(0);
  }

  /** The "3 of 12 ticked" line under the open list's title — the master column shows it too. */
  progress(): Locator {
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
  async deleteListIfPresent(listId: string): Promise<boolean> {
    await this.page.goto(`/food/shopping-lists/${listId}`);

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
   * Removes every list the household still has. Only for the exclusive project, where one spec needs
   * "no lists exist" as a precondition and owns the household while it runs.
   */
  async deleteAllLists() {
    await this.goto();
    await this.showCompleted(true);

    // Re-read each time: deleting one re-renders the column, so a captured handle goes stale.
    let link = this.page.locator('a[href^="/food/shopping-lists/"]').first();
    while ((await link.count()) > 0) {
      const href = await link.getAttribute('href');
      await this.deleteListIfPresent(/\/food\/shopping-lists\/(\d+)/.exec(href ?? '')![1]!);
      await this.goto();
      await this.showCompleted(true);
      link = this.page.locator('a[href^="/food/shopping-lists/"]').first();
    }
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
  masterColumn(): Locator {
    return this.page.getByRole('complementary');
  }

  backToAllLists(): Locator {
    return this.page.getByRole('link', { name: 'All lists' });
  }
}

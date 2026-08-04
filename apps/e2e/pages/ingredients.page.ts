import { expect, type Locator, type Page } from '@playwright/test';

import { SearchBox } from './search-box';

/** The household ingredient library (`/food/ingredients`). */
export class IngredientsPage {
  private readonly searchBox: SearchBox;

  constructor(private readonly page: Page) {
    this.searchBox = new SearchBox(page, 'Search ingredients');
  }

  async goto() {
    await this.page.goto('/food/ingredients');
    await expect(this.page.getByRole('heading', { level: 1, name: 'Ingredients' })).toBeVisible();
  }

  /**
   * Same destination, reached through the sidebar instead of the address bar — so the tab keeps the
   * JS context it already had. `goto()` is a full document load, which rebuilds the realtime client
   * from scratch and would mask any bug in how a long-lived one survives a change beneath it.
   */
  async openFromSidebar() {
    await this.page.getByRole('link', { name: 'Ingredients', exact: true }).click();
    await expect(this.page.getByRole('heading', { level: 1, name: 'Ingredients' })).toBeVisible();
  }

  row(name: string): Locator {
    return this.page.getByRole('row').filter({ hasText: name });
  }

  /** Opens the add dialog with the name already filled — the first two steps of every add path. */
  private async openAddDialog(name: string): Promise<Locator> {
    await this.page.getByRole('button', { name: 'Add ingredient', exact: true }).first().click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByLabel('Name').fill(name);

    return dialog;
  }

  /** Types a shop the library doesn't have into the dialog's picker, and creates it from there. */
  private async createStoreInDialog(dialog: Locator, storeName: string) {
    await dialog.getByRole('button', { name: 'Shop', exact: true }).click();
    await this.page.getByPlaceholder('Search shops').fill(storeName);
    await this.page.getByRole('button', { name: `Create "${storeName}"` }).click();
  }

  async add(name: string, category?: string) {
    const dialog = await this.openAddDialog(name);

    if (category) {
      await dialog.getByRole('combobox').first().click();
      await this.page.getByRole('option', { name: category, exact: true }).click();
    }

    await dialog.getByRole('button', { name: 'Add ingredient', exact: true }).click();
    await expect(dialog).toBeHidden();
  }

  /**
   * Adds an ingredient filed under a shop that doesn't exist yet, typed straight into the dialog's
   * shop picker. The shop is found-or-created by the same save, so nothing is minted until then.
   *
   * The picker is a `PopoverTrigger`, not a Radix `Select`, so it's a button rather than a combobox
   * — which is also what keeps it clear of the category/unit selects in the same dialog.
   */
  async addWithNewStore(name: string, storeName: string) {
    const dialog = await this.openAddDialog(name);

    await this.createStoreInDialog(dialog, storeName);
    await expect(dialog.getByRole('button', { name: 'Shop', exact: true })).toContainText(storeName);

    await dialog.getByRole('button', { name: 'Add ingredient', exact: true }).click();
    await expect(dialog).toBeHidden();
  }

  /**
   * Same as `addWithNewStore`, but for the path where the ingredient name is refused — the dialog
   * stays open on the 409, so this returns it rather than waiting for it to close.
   */
  async addWithNewStoreExpectingError(name: string, storeName: string) {
    const dialog = await this.openAddDialog(name);

    await this.createStoreInDialog(dialog, storeName);

    await dialog.getByRole('button', { name: 'Add ingredient', exact: true }).click();
    await expect(dialog).toContainText('already in your ingredient library');

    return dialog;
  }

  /**
   * Submits the add dialog and leaves it open, for the duplicate-name path where the server's 409
   * lands on the name field instead of closing the dialog.
   */
  async addExpectingError(name: string) {
    const dialog = await this.openAddDialog(name);
    await dialog.getByRole('button', { name: 'Add ingredient', exact: true }).click();

    return dialog;
  }

  /**
   * The inline category select in a row. Named cells rather than positional ones: the toolbar filter
   * is a combobox too, and both editable cells are comboboxes within the same row.
   */
  async setCategoryInline(name: string, category: string) {
    await this.pickInRow(name, 'Category', category);
  }

  async setDefaultUnitInline(name: string, unit: string) {
    await this.pickInRow(name, 'Default unit', unit);
  }

  /**
   * Assigns the shop an ingredient is bought at — what decides its section on a shopping list.
   *
   * Not `pickInRow`: this cell is a combobox built on a Popover, so its trigger is a button rather
   * than the `combobox` role a Radix `Select` reports.
   */
  async setStoreInline(name: string, store: string) {
    await this.openStorePicker(name);
    await this.page.getByRole('option', { name: store, exact: true }).click();
  }

  /** Files a row under a shop that doesn't exist yet, created by the same patch that assigns it. */
  async createStoreInline(name: string, storeName: string) {
    await this.openStorePicker(name);
    await this.page.getByPlaceholder('Search shops').fill(storeName);
    await this.page.getByRole('button', { name: `Create "${storeName}"` }).click();
  }

  /**
   * `exact` matters: Playwright matches an accessible name as a *substring* by default, so a plain
   * `'Shop'` also picks up the row's name-cell button whenever the ingredient is called something
   * like "Shopped" — two matches, and a strict-mode failure.
   */
  private async openStorePicker(name: string) {
    // Settle on the row before reaching into it, so the click can't land mid-rerender.
    await expect(this.row(name)).toBeVisible();
    await this.row(name).getByRole('button', { name: 'Shop', exact: true }).click();
  }

  /**
   * Narrows the list to one shop. The toolbar control is labelled "Filter by shop" rather than
   * "Shop" precisely so it can't match a row's own shop cell, and this waits out the navigation so
   * the next assertion reads the filtered list.
   */
  async filterByStore(store: string) {
    await this.page.getByRole('combobox', { name: 'Filter by shop' }).click();
    await this.page.getByRole('option', { name: store, exact: true }).click();
    await this.page.waitForURL((url) => url.searchParams.has('store'));
  }

  async clearStoreFilter() {
    await this.page.getByRole('combobox', { name: 'Filter by shop' }).click();
    await this.page.getByRole('option', { name: 'Any shop', exact: true }).click();
    await this.page.waitForURL((url) => !url.searchParams.has('store'));
  }

  /** Renames a row in place: click the name, type, Enter. */
  async renameInline(from: string, to: string) {
    await this.openInlineRename(from, to);
    await this.commitInlineRename();
  }

  /** Commits whatever an open inline editor is carrying. Split out for the specs that need to let
   * something happen to the table between opening the editor and pressing Enter. */
  async commitInlineRename() {
    await this.nameInput().press('Enter');
  }

  /** Opens a row's inline editor and types a new name into it, without committing. */
  async openInlineRename(from: string, to: string) {
    await this.openNameEditor(from);
    await this.nameInput().fill(to);
  }

  /**
   * Renames to a name already in the library. The 409 surfaces as a toast and the input stays open
   * carrying what was typed, so this asserts the editor survived and returns the toast region.
   */
  async renameInlineExpectingError(from: string, to: string) {
    await this.renameInline(from, to);
    await expect(this.nameInput()).toBeVisible();

    return this.toasts();
  }

  /** Abandons an open inline rename, leaving the row on the name it had. */
  async cancelInlineRename() {
    await this.nameInput().press('Escape');
    await expect(this.nameInput()).toBeHidden();
  }

  /**
   * Clicks out of an open inline rename. After a refused value that has to abandon the edit rather
   * than re-fire the same doomed request, so this asserts the editor actually closed.
   */
  async blurInlineRename() {
    await this.nameInput().blur();
    await expect(this.nameInput()).toBeHidden();
  }

  /**
   * The open inline rename input. Only one row edits at a time, and it's scoped to the table so the
   * add/edit dialog's identically-labelled field can never match instead.
   */
  private nameInput(): Locator {
    return this.page.getByRole('table').getByRole('textbox', { name: 'Name' });
  }

  /**
   * Sonner's live region, where a rejected rename reports its reason. The toasts inside it are plain
   * `li`s with no role of their own, so the named region is the role-based way to reach them.
   */
  private toasts(): Locator {
    return this.page.getByRole('region', { name: /Notifications/ });
  }

  private async openNameEditor(name: string) {
    await expect(this.row(name)).toBeVisible();
    await this.row(name).getByRole('button', { name, exact: true }).click();
    await expect(this.nameInput()).toBeFocused();
  }

  private async pickInRow(name: string, field: string, option: string) {
    // Settle on the row before reaching into it, so the click can't land mid-rerender.
    await expect(this.row(name)).toBeVisible();
    await this.row(name).getByRole('combobox', { name: field }).click();
    await this.page.getByRole('option', { name: option, exact: true }).click();
  }

  async editCategory(name: string, category: string) {
    await this.openRowMenu(name);
    await this.page.getByRole('menuitem', { name: 'Edit ingredient' }).click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByRole('combobox').first().click();
    await this.page.getByRole('option', { name: category, exact: true }).click();
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toBeHidden();
  }

  /** Best-effort cleanup: removes the ingredient when it's in the library, and says so. */
  async deleteIfPresent(name: string): Promise<boolean> {
    if ((await this.row(name).count()) === 0) {
      return false;
    }

    await this.delete(name);

    return true;
  }

  async delete(name: string) {
    await this.openRowMenu(name);
    await this.page.getByRole('menuitem', { name: 'Delete ingredient' }).click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Delete ingredient' }).click();
    await expect(dialog).toBeHidden();
  }

  /**
   * Opens the delete dialog for an ingredient a recipe still uses. The confirm is blocked up front
   * rather than round-tripping to a 409, so this returns the dialog without clicking it.
   */
  async openDeleteExpectingRefusal(name: string) {
    await this.openRowMenu(name);
    await this.page.getByRole('menuitem', { name: 'Delete ingredient' }).click();

    return this.page.getByRole('dialog');
  }

  /** Searches the list; the SearchBox waits out the debounce so the next step can't race it. */
  async search(term: string) {
    await this.searchBox.fill(term);
  }

  private async openRowMenu(name: string) {
    // Settle on the row before reaching into it, so the click can't land mid-rerender.
    await expect(this.row(name)).toBeVisible();
    await this.row(name).getByRole('button', { name: 'Open menu' }).click();
  }
}

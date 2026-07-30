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

  row(name: string): Locator {
    return this.page.getByRole('row').filter({ hasText: name });
  }

  async add(name: string, category?: string) {
    await this.page.getByRole('button', { name: 'Add ingredient', exact: true }).first().click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByLabel('Name').fill(name);

    if (category) {
      await dialog.getByRole('combobox').first().click();
      await this.page.getByRole('option', { name: category, exact: true }).click();
    }

    await dialog.getByRole('button', { name: 'Add ingredient', exact: true }).click();
    await expect(dialog).toBeHidden();
  }

  /**
   * Submits the add dialog and leaves it open, for the duplicate-name path where the server's 409
   * lands on the name field instead of closing the dialog.
   */
  async addExpectingError(name: string) {
    await this.page.getByRole('button', { name: 'Add ingredient', exact: true }).first().click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByLabel('Name').fill(name);
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

  /** Renames a row in place: click the name, type, Enter. */
  async renameInline(from: string, to: string) {
    await this.openInlineRename(from, to);
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

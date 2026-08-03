import { expect, type Locator, type Page } from '@playwright/test';

import { SearchBox } from './search-box';

/** The household's shops (`/food/ingredients/stores`) — the Shops tab of the ingredients page. */
export class StoresPage {
  private readonly searchBox: SearchBox;

  constructor(private readonly page: Page) {
    this.searchBox = new SearchBox(page, 'Search shops');
  }

  async goto() {
    await this.page.goto('/food/ingredients/stores');
    await this.expectOpen();
  }

  /**
   * Reaches the same place through the tab bar rather than the address bar, which is the only way
   * to prove the tabs are wired as real routes — a `goto` would pass even if the trigger did nothing.
   */
  async openFromTab() {
    await this.page.getByRole('tab', { name: 'Shops' }).click();
    await this.expectOpen();
  }

  async expectOpen() {
    await expect(this.page.getByRole('tab', { name: 'Shops', selected: true })).toBeVisible();
    await expect(this.page.getByPlaceholder('Search shops')).toBeVisible();
  }

  row(name: string): Locator {
    return this.page.getByRole('row').filter({ hasText: name });
  }

  async add(name: string, notes?: string) {
    await this.page.getByRole('button', { name: 'Add shop', exact: true }).first().click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByLabel('Name').fill(name);

    if (notes) {
      await dialog.getByLabel('Notes').fill(notes);
    }

    await dialog.getByRole('button', { name: 'Add shop', exact: true }).click();
    await expect(dialog).toBeHidden();
  }

  /**
   * Submits the add dialog and leaves it open, for the duplicate-name path where the server's 409
   * lands on the name field instead of closing the dialog.
   */
  async addExpectingError(name: string) {
    await this.page.getByRole('button', { name: 'Add shop', exact: true }).first().click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByLabel('Name').fill(name);
    await dialog.getByRole('button', { name: 'Add shop', exact: true }).click();

    return dialog;
  }

  /** Renames a row in place: click the name, type, Enter. */
  async renameInline(from: string, to: string) {
    await expect(this.row(from)).toBeVisible();
    await this.row(from).getByRole('button', { name: from, exact: true }).click();
    await expect(this.nameInput()).toBeFocused();
    await this.nameInput().fill(to);
    await this.nameInput().press('Enter');
  }

  /**
   * The open inline rename input. Only one row edits at a time, and it's scoped to the table so the
   * add/edit dialog's identically-labelled field can never match instead.
   */
  private nameInput(): Locator {
    return this.page.getByRole('table').getByRole('textbox', { name: 'Name' });
  }

  /** Best-effort cleanup: removes the shop when it's listed, and says so. */
  async deleteIfPresent(name: string): Promise<boolean> {
    if ((await this.row(name).count()) === 0) {
      return false;
    }

    await this.delete(name);

    return true;
  }

  async delete(name: string) {
    await this.openRowMenu(name);
    await this.page.getByRole('menuitem', { name: 'Delete shop' }).click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Delete shop' }).click();
    await expect(dialog).toBeHidden();
  }

  /** Opens the delete dialog without confirming, so a spec can read what it warns about. */
  async openDelete(name: string) {
    await this.openRowMenu(name);
    await this.page.getByRole('menuitem', { name: 'Delete shop' }).click();

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

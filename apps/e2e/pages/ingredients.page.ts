import { expect, type Locator, type Page } from '@playwright/test';

/** The household ingredient library (`/food/ingredients`). */
export class IngredientsPage {
  constructor(private readonly page: Page) {}

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

  /**
   * Types into the search box and waits for the URL to catch up. The input debounces for 400ms
   * before navigating, so without this the next action can fire while the table is re-rendering and
   * click a row that is about to detach.
   */
  async search(term: string) {
    await this.page.getByPlaceholder('Search ingredients').fill(term);
    await this.page.waitForURL((url) =>
      term === '' ? !url.searchParams.has('search') : url.searchParams.get('search') === term
    );
  }

  private async openRowMenu(name: string) {
    // Settle on the row before reaching into it, so the click can't land mid-rerender.
    await expect(this.row(name)).toBeVisible();
    await this.row(name).getByRole('button', { name: 'Open menu' }).click();
  }
}

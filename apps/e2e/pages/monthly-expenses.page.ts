import { expect, type Locator, type Page } from '@playwright/test';

import { SearchBox } from './search-box';

/**
 * The month's expenses (`/expenses/monthly-expenses`), and the category sheet the URL opens over it.
 *
 * Specs pick a **far-future month of their own** rather than sharing the current one. Unique row
 * titles aren't enough here, unlike everywhere else in this suite: the header total is an aggregate
 * over the whole month, so two workers logging into the same one would race each other's assertion.
 */
export class MonthlyExpensesPage {
  private readonly searchBox: SearchBox;

  constructor(private readonly page: Page) {
    this.searchBox = new SearchBox(page, 'Search expenses');
  }

  /** Opens a specific month. `month` is 1–12, as the URL carries it. */
  async goto(month: number, year: number) {
    await this.page.goto(`/expenses/monthly-expenses?month=${month}&year=${year}`);
    await this.expectOpen();
  }

  async expectOpen() {
    await expect(this.page.getByRole('button', { name: 'Add expense', exact: true }).first()).toBeVisible();
  }

  row(title: string): Locator {
    return this.page.getByRole('row').filter({ hasText: title });
  }

  /** The month's header total, e.g. "Total 42,00 € · 30,00 € paid back". */
  total(): Locator {
    return this.page.getByTestId('month-total');
  }

  /**
   * A row, found without going through the accessibility tree.
   *
   * The sheet is a modal, so Radix marks everything behind it `aria-hidden` — which is exactly what
   * it should do, and exactly why `getByRole('row')` finds nothing there. Proving the table is still
   * *mounted* under the panel therefore has to bypass roles.
   */
  rowBehindSheet(title: string): Locator {
    return this.page.locator('tbody tr').filter({ hasText: title });
  }

  /** A slice of the per-category breakdown, which doubles as the category filter. */
  breakdownChip(category: string): Locator {
    return this.page.getByRole('button', { name: new RegExp(`^${category}`) });
  }

  /**
   * The empty state's own call to action. `nth(1)` because the header carries the same button and
   * comes first in the DOM — which is also why `add()` deliberately takes `.first()`.
   */
  emptyStateCta(): Locator {
    return this.page.getByRole('button', { name: 'Add expense', exact: true }).nth(1);
  }

  emptyStateTitle(text: string): Locator {
    return this.page.getByRole('main').getByText(text, { exact: false });
  }

  async add({ amount, category, title }: { amount: string; category?: string; title: string }) {
    await this.page.getByRole('button', { name: 'Add expense', exact: true }).first().click();
    const dialog = this.page.getByRole('dialog');

    await dialog.getByLabel('Title').fill(title);
    await dialog.getByLabel('Amount').fill(amount);

    if (category) {
      await dialog.getByRole('button', { name: 'Category' }).click();
      await this.pickCategory(category);
    }

    await dialog.getByRole('button', { name: 'Add expense', exact: true }).click();
    await expect(dialog).toBeHidden();
  }

  /**
   * Picks a category in an open picker, creating it if the name isn't there yet. The create row only
   * appears once the search has no exact match, which is why the name is typed first either way.
   */
  private async pickCategory(name: string) {
    await this.page.getByPlaceholder('Search categories…').fill(name);

    const create = this.page.getByRole('button', { name: `Create "${name}"` });
    const existing = this.page.getByRole('option', { name, exact: true });

    if ((await existing.count()) > 0) {
      await existing.click();
    } else {
      await create.click();
    }
  }

  /** Sets a row's category through its inline cell. Creates the category if it's new. */
  async setCategoryInline(title: string, category: string) {
    await expect(this.row(title)).toBeVisible();
    await this.row(title).getByRole('button', { name: 'Category' }).click();
    await this.pickCategory(category);
  }

  /** Opens the categories sheet from a row's picker — the way the feature intends you to reach it. */
  async openCategoriesFromRow(title: string) {
    await expect(this.row(title)).toBeVisible();
    await this.row(title).getByRole('button', { name: 'Category' }).click();
    await this.page.getByRole('button', { name: 'Edit categories' }).click();
    await expect(this.sheet()).toBeVisible();
  }

  sheet(): Locator {
    return this.page.getByRole('dialog', { name: 'Expense categories' });
  }

  async closeSheet() {
    await this.page.keyboard.press('Escape');
    await expect(this.sheet()).toBeHidden();
  }

  async addCategory(name: string) {
    await this.sheet().getByRole('button', { name: 'Add category' }).click();
    const input = this.sheet().getByRole('textbox', { name: 'New category name' });
    await input.fill(name);
    await input.press('Enter');
    await expect(this.sheet().getByText(name, { exact: true })).toBeVisible();
  }

  async renameCategory(from: string, to: string) {
    await this.sheet()
      .getByRole('button', { name: `Rename ${from}` })
      .click();
    const input = this.sheet().getByRole('textbox', { name: 'Category name' });
    await input.fill(to);
    await input.press('Enter');
  }

  async deleteCategory(name: string) {
    await this.sheet()
      .getByRole('button', { name: `Delete ${name}` })
      .click();
    const confirm = this.page.getByRole('dialog', { name: 'Delete category?' });
    await confirm.getByRole('button', { name: 'Delete' }).click();
    await expect(confirm).toBeHidden();
  }

  /** Edits a cell in place: click the value, type, Enter. */
  async editInline(title: string, field: 'Title' | 'Amount', value: string) {
    await this.openInlineEdit(title, field);
    const input = this.page.getByRole('table').getByRole('textbox', { name: field });
    await input.fill(value);
    await input.press('Enter');
  }

  /** Opens an inline title edit and leaves it open, for the row-identity spec. */
  async openInlineTitleEdit(title: string) {
    await this.openInlineEdit(title, 'Title');
  }

  private async openInlineEdit(title: string, field: 'Title' | 'Amount') {
    // Settle on the row before reaching into it, so the click can't land mid-rerender.
    await expect(this.row(title)).toBeVisible();
    await this.row(title)
      .getByRole('button', { name: `Edit ${field.toLowerCase()}` })
      .click();
    await expect(this.page.getByRole('table').getByRole('textbox', { name: field })).toBeFocused();
  }

  /** Cleanup helper: opens the sheet by URL and removes the category if it's still there. */
  async deleteCategoryIfPresent(name: string, month: number, year: number) {
    await this.page.goto(`/expenses/monthly-expenses/categories?month=${month}&year=${year}`);
    await expect(this.sheet()).toBeVisible();

    if ((await this.sheet().getByText(name, { exact: true }).count()) > 0) {
      await this.deleteCategory(name);
    }
  }

  async commitInlineTitleEdit(value: string) {
    await this.titleInput().fill(value);
    await this.titleInput().press('Enter');
  }

  private titleInput(): Locator {
    return this.page.getByRole('table').getByRole('textbox', { name: 'Title' });
  }

  async togglePaidBack(title: string) {
    await this.openRowMenu(title);
    await this.page.getByRole('menuitem', { name: /Mark as (paid back|spent)/ }).click();
  }

  async delete(title: string) {
    await this.openRowMenu(title);
    await this.page.getByRole('menuitem', { name: 'Delete expense' }).click();
    const dialog = this.page.getByRole('dialog', { name: 'Delete expense?' });
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect(dialog).toBeHidden();
  }

  /** Best-effort cleanup: removes the expense when it's listed, and says so. */
  async deleteIfPresent(title: string): Promise<boolean> {
    if ((await this.row(title).count()) === 0) {
      return false;
    }

    await this.delete(title);

    return true;
  }

  async search(term: string) {
    await this.searchBox.fill(term);
  }

  async selectMonth(month: number) {
    await this.page.getByRole('combobox', { name: 'Month' }).click();
    await this.page
      .getByRole('option')
      .nth(month - 1)
      .click();
    await this.page.waitForURL((url) => url.searchParams.get('month') === String(month));
  }

  private async openRowMenu(title: string) {
    // Settle on the row before reaching into it, so the click can't land mid-rerender.
    await expect(this.row(title)).toBeVisible();
    await this.row(title)
      .getByRole('button', { name: `Actions for ${title}` })
      .click();
  }
}

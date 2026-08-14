import { expect, type Page } from '@playwright/test';

/**
 * The pagination bar, as a component object like `SearchBox`. Every action waits for the URL to
 * carry the change, or the next assertion reads the page you left.
 */
export class Pagination {
  constructor(private readonly page: Page) {}

  private group() {
    return this.page.getByRole('group', { name: 'Pagination' });
  }

  /** "1–3 of 8". */
  range() {
    return this.page.getByText(/\d+–\d+ of \d+/);
  }

  private async clickAndWait(name: string, page: number) {
    await this.group().getByRole('button', { name }).click();
    await this.page.waitForURL((url) => Number(url.searchParams.get('page') ?? 1) === page);
  }

  next(landingOn: number) {
    return this.clickAndWait('Next page', landingOn);
  }

  previous(landingOn: number) {
    return this.clickAndWait('Previous page', landingOn);
  }

  first() {
    return this.clickAndWait('First page', 1);
  }

  last(landingOn: number) {
    return this.clickAndWait('Last page', landingOn);
  }

  goToPage(page: number) {
    return this.clickAndWait(`Page ${page}`, page);
  }

  button(name: string) {
    return this.group().getByRole('button', { name });
  }

  /** By `aria-current`, which is what tells a screen reader which page it is on. */
  current() {
    return this.group().locator('button[aria-current="page"]');
  }

  async setRowsPerPage(size: number) {
    await this.page.getByRole('combobox', { name: 'Rows per page' }).click();
    await this.page.getByRole('option', { name: String(size), exact: true }).click();
    await this.page.waitForURL((url) => url.searchParams.get('pageSize') === String(size));
  }

  async expectOnPage(page: number) {
    await expect(this.current()).toHaveText(String(page));
  }
}

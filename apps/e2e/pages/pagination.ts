import { expect, type Page } from '@playwright/test';

/**
 * The pagination bar every paginated list ends with (`DataTablePagination`). A component object
 * rather than a page object: it belongs to whichever page renders it.
 *
 * Every action waits for the URL to carry the change before returning. The page number lives in the
 * search params and the rows arrive with the navigation, so an assertion made straight after a click
 * can still be reading the page you just left.
 */
export class Pagination {
  constructor(private readonly page: Page) {}

  private group() {
    return this.page.getByRole('group', { name: 'Pagination' });
  }

  /** "1–3 of 8" — the row range this page covers, and how many there are behind it. */
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

  /** Jumps by clicking a numbered button — the thing a cursor-paginated list can't offer. */
  goToPage(page: number) {
    return this.clickAndWait(`Page ${page}`, page);
  }

  button(name: string) {
    return this.group().getByRole('button', { name });
  }

  /**
   * The button for the page currently being read. Located by `aria-current`, which is what actually
   * tells a screen reader which page it is on — a variant class would say it only to the sighted.
   */
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

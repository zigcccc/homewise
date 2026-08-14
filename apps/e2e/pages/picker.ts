import { expect, type Page } from '@playwright/test';

/** Mirrors `SEARCH_DEBOUNCE_MS`, which lives in the web app and isn't importable from here. */
const DEBOUNCE_MS = 400;

/**
 * An entity picker (`AsyncComboboxContent`), as a component object like `SearchBox`. Searching hits
 * the server and pages, so every read goes through `settle()` — the rows on screen belong to the
 * *previous* term until the debounced request lands, and clicking one of those picks the wrong row.
 */
export class Picker {
  constructor(
    private readonly page: Page,
    private readonly name: string
  ) {}

  private input() {
    return this.page.getByRole('combobox', { name: this.name });
  }

  /** By slot, not `role=status` — dnd-kit keeps a live region on the page that also matches that. */
  private loading() {
    return this.page.locator('[data-slot="combobox-loading"]');
  }

  /**
   * The result rows. Pass the group heading where the picker renders one — unscoped this also counts
   * standing rows like the shop picker's "None", which is not a result.
   */
  options(group?: string) {
    const root = group ? this.page.getByRole('group', { name: group }) : this.page;

    return root.getByRole('option');
  }

  /**
   * A row by name. Matched as a substring by default because most pickers put meta beside the name —
   * a contact's type, an ingredient's category — which is part of the option's accessible name. Pass
   * `exact` where the picker has none and a longer name could swallow the match.
   */
  option(name: string, { exact = false }: { exact?: boolean } = {}) {
    return this.page.getByRole('option', { exact, name });
  }

  createButton(term: string) {
    return this.page.getByRole('button', { name: `Create "${term}"` });
  }

  loadMoreButton() {
    return this.page.getByRole('button', { name: 'Load more' });
  }

  /** Waits until what's rendered answers the term in the box rather than the one before it. */
  async settle() {
    await this.page.waitForTimeout(DEBOUNCE_MS + 100);
    await expect(this.loading()).toBeHidden();
  }

  async search(term: string) {
    await this.input().fill(term);
    await this.settle();
  }

  async pick(name: string) {
    await this.search(name);
    await this.option(name).click();
  }

  async create(term: string) {
    await this.search(term);
    await this.createButton(term).click();
  }

  async loadMore() {
    await this.loadMoreButton().click();
    await expect(this.loading()).toBeHidden();
  }

  /** Scrolls the popup list to the bottom, which is what trips the sentinel. */
  async scrollToBottom(group?: string) {
    await this.options(group).last().scrollIntoViewIfNeeded();
    await expect(this.loading()).toBeHidden();
  }
}

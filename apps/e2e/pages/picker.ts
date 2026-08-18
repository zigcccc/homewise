import { expect, type Page } from '@playwright/test';

/** An entity picker. Its rows answer the *previous* term until the debounced request lands. */
export class Picker {
  constructor(
    private readonly page: Page,
    private readonly name: string
  ) {}

  private input() {
    return this.content().getByRole('combobox', { name: this.name });
  }

  /** By slot, not `role=status` — dnd-kit keeps a live region on the page that also matches that. */
  private loading() {
    return this.content().locator('[data-slot="combobox-loading"]');
  }

  /** Pass the group heading, or this also counts standing rows like the shop picker's "None". */
  options(group?: string) {
    const root = group ? this.content().getByRole('group', { name: group }) : this.content();

    return root.getByRole('option');
  }

  /** Substring by default: a row's accessible name carries its meta too — a type, a category. */
  option(name: string, { exact = false }: { exact?: boolean } = {}) {
    return this.content().getByRole('option', { exact, name });
  }

  createButton(term: string) {
    return this.content().getByRole('button', { name: `Create "${term}"` });
  }

  loadMoreButton() {
    return this.content().getByRole('button', { name: 'Load more' });
  }

  /**
   * The open popup, and the root of every locator above.
   *
   * Radix keeps a closed popover mounted through its exit animation, so a spec that opens a second
   * picker straight after using one sees **two** of everything — matching `data-state="open"` is what
   * keeps the strict-mode violation off. Scoping the rest to it matters as much as the state does:
   * unscoped, `getByRole('combobox', …)` found the closing popover's input just as happily.
   */
  private content() {
    return this.page.locator('[data-slot="combobox-content"][data-state="open"]');
  }

  /** Both halves: "nothing in flight" is also true *before* the debounced request has started. */
  private async settle(term: string) {
    await expect(this.content()).toHaveAttribute('data-search', term);
    await expect(this.loading()).toBeHidden();
  }

  async search(term: string) {
    await this.input().fill(term);
    await this.settle(term);
  }

  async pick(name: string) {
    await this.search(name);
    await this.option(name).click();
  }

  async create(term: string) {
    await this.search(term);
    await this.createButton(term).click();
  }

  // Paging only appends, so the caller's row-count assertion is what waits for the page to land.
  async loadMore() {
    await this.loadMoreButton().click();
  }

  /** Scrolls the popup list to the bottom, which is what trips the sentinel. */
  async scrollToBottom(group?: string) {
    await this.options(group).last().scrollIntoViewIfNeeded();
  }
}

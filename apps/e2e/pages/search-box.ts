import { type Page } from '@playwright/test';

/**
 * The debounced search input every list view shares (`SearchInput`). A component object rather than
 * a page object: it is owned by whichever page renders it, and only knows its own label.
 *
 * Located by accessible name, not placeholder — a spec that can only find this by placeholder is a
 * spec proving the control has no name at all.
 *
 * Typing is not enough on its own. The input debounces for 400ms before navigating, so an action
 * taken straight after `fill()` can land while the list is re-rendering and click a row that is
 * about to detach. Waiting for the URL to carry the term is what makes the next step safe.
 */
export class SearchBox {
  constructor(
    private readonly page: Page,
    private readonly label: string
  ) {}

  private input() {
    return this.page.getByRole('textbox', { name: this.label });
  }

  /** Searches for `term`; pass `''` to clear, which drops the param rather than emptying it. */
  async fill(term: string) {
    await this.input().fill(term);
    await this.page.waitForURL((url) =>
      term === '' ? !url.searchParams.has('search') : url.searchParams.get('search') === term
    );
  }

  /** What the box currently shows — the question "did Back put the term back?" is asked of this. */
  value() {
    return this.input();
  }
}

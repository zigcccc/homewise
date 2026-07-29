import { type Page } from '@playwright/test';

/**
 * The debounced search input every list view shares. A component object rather than a page object:
 * it's owned by whichever page renders it, and only knows its own placeholder.
 *
 * Typing is not enough on its own. The input debounces for 400ms before navigating, so an action
 * taken straight after `fill()` can land while the list is re-rendering and click a row that is
 * about to detach. Waiting for the URL to carry the term is what makes the next step safe.
 */
export class SearchBox {
  constructor(
    private readonly page: Page,
    private readonly placeholder: string
  ) {}

  /** Searches for `term`; pass `''` to clear, which drops the param rather than emptying it. */
  async fill(term: string) {
    await this.page.getByPlaceholder(this.placeholder).fill(term);
    await this.page.waitForURL((url) =>
      term === '' ? !url.searchParams.has('search') : url.searchParams.get('search') === term
    );
  }
}

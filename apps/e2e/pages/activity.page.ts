import { expect, type Page } from '@playwright/test';

import { SearchBox } from './search-box';

/**
 * The household activity feed (`/manage/activity`).
 *
 * Every other spec's writes land in this list too, so nothing here offers a "first row" or a count.
 * The only safe question is whether a *particular* line is present, which is why `find` filters
 * before it looks.
 */
export class ActivityPage {
  private readonly searchBox: SearchBox;

  constructor(private readonly page: Page) {
    this.searchBox = new SearchBox(page, 'Search what changed');
  }

  async goto() {
    await this.page.goto('/manage/activity');
    await expect(this.page.getByRole('heading', { level: 1, name: 'Activity' })).toBeVisible();
  }

  /** Through the sidebar, so the tab keeps its JS context — a `goto` rebuilds the realtime client. */
  async openFromSidebar() {
    await this.page.getByRole('link', { name: 'Activity', exact: true }).click();
    await expect(this.page.getByRole('heading', { level: 1, name: 'Activity' })).toBeVisible();
  }

  feed() {
    return this.page.getByTestId('activity-feed');
  }

  /** A line mentioning `label`. By testid, since the filter row echoes the search term back. */
  entry(label: string) {
    return this.page.getByTestId('activity-entry').filter({ hasText: label });
  }

  /** Shown instead of the feed when nothing matches — what "this was not logged" looks like. */
  empty() {
    return this.page.getByText('Nothing matches');
  }

  /**
   * Narrows to one line by searching for it first — the feed is shared, so a label three pages down
   * is invisible until it is filtered to.
   */
  async find(label: string) {
    await this.searchBox.fill(label);

    return this.entry(label).first();
  }

  /** Waits for the choice to reach the URL, so a negative assertion can't read the pre-filter list. */
  async filterByKind(kind: string) {
    await this.page.getByRole('combobox', { name: 'Filter by kind' }).click();
    await this.page.getByRole('option', { name: kind, exact: true }).click();
    await this.page.waitForURL((url) => url.searchParams.has('entity'));
  }

  async filterByMember(member: string) {
    await this.page.getByRole('combobox', { name: 'Filter by member' }).click();
    await this.page.getByRole('option', { name: member, exact: true }).click();
    await this.page.waitForURL((url) => url.searchParams.has('actorId'));
  }

  loadMore() {
    return this.page.getByRole('button', { name: 'Load more' });
  }

  /** Every day heading currently rendered, top to bottom. */
  async dayHeadings() {
    return this.feed().getByRole('heading', { level: 2 }).allTextContents();
  }
}

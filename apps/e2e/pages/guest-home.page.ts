import { expect, type Page } from '@playwright/test';

import { SEED_EXTERNAL_USER, SEED_HOUSEHOLD_NAME } from '@homewise/server/seed-fixtures';

/** Where an `external` member lands (`/guest`) — their own home, not the dashboard. */
export class GuestHomePage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/guest');
    await this.expectLoaded();
  }

  /**
   * `support/test.ts` waits on this before saving an external session, for the same reason the
   * dashboard's twin exists: the greeting is the one thing on the page no other spec can change.
   */
  async expectLoaded({
    householdName = SEED_HOUSEHOLD_NAME,
    userName = SEED_EXTERNAL_USER.name,
  }: {
    householdName?: string;
    userName?: string;
  } = {}) {
    await expect(this.page.getByRole('heading', { level: 1 })).toContainText(userName);
    await expect(this.page.getByTestId('guest-greeting')).toContainText(householdName);
  }

  card(title: string) {
    return this.page.getByRole('region', { name: title });
  }
}

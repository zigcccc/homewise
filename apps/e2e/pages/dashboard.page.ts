import { expect, type Page } from '@playwright/test';

import { SEED_HOUSEHOLD_NAME, SEED_USER } from '@homewise/server/seed-fixtures';

/** The authenticated home/dashboard (`/`). */
export class DashboardPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/');
  }

  /** Asserts the dashboard rendered for the seeded user + household. */
  async expectLoaded() {
    await expect(this.page.getByRole('heading', { name: `Hello ${SEED_USER.name}!` })).toBeVisible();
    await expect(this.page.getByRole('heading', { name: `Your household: ${SEED_HOUSEHOLD_NAME}` })).toBeVisible();
  }
}

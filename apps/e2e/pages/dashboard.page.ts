import { expect, type Page } from '@playwright/test';

import { SEED_HOUSEHOLD_NAME, SEED_USER } from '@homewise/server/seed-fixtures';

/** The authenticated home/dashboard (`/`). */
export class DashboardPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/');
    await this.expectLoaded();
  }

  /**
   * `auth.setup.ts` waits on this before saving `storageState`, so every spec starts behind it —
   * hence the greeting rather than any card, whose data the parallel workers keep changing.
   */
  async expectLoaded({
    householdName = SEED_HOUSEHOLD_NAME,
    userName = SEED_USER.name,
  }: {
    householdName?: string;
    userName?: string;
  } = {}) {
    await expect(this.page.getByRole('heading', { level: 1 })).toContainText(userName);
    // By testid: the sidebar names the household too, and `getByRole('main')` matches two elements.
    await expect(this.page.getByTestId('dashboard-greeting')).toContainText(householdName);
  }

  /** One card, by its title. Six lists are on screen at once, so assertions must be scoped. */
  card(title: string) {
    return this.page.getByRole('region', { name: title });
  }

  weekMeals() {
    return this.card("This week's meals");
  }

  shoppingLists() {
    return this.card('Shopping lists');
  }

  birthdays() {
    return this.card('Upcoming birthdays');
  }

  spending() {
    return this.card("This month's spending");
  }

  loans() {
    return this.card('Out on loan');
  }

  recentRecipes() {
    return this.card('Recently added recipes');
  }

  /** The month's headline figure, which the card renders once per currency. */
  monthTotal() {
    return this.page.getByTestId('dashboard-month-total');
  }
}

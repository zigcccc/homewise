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
   * Asserts the dashboard rendered, for the seeded user and household unless told otherwise — the
   * onboarding spec lands here as a different user, on a household it just named.
   *
   * **`auth.setup.ts` waits on this before it saves `storageState`**, so every spec in the suite
   * starts behind it — which is why it stays cheap and asserts the greeting rather than any card.
   * A card is data, and data is what the parallel workers are all changing underneath each other.
   */
  async expectLoaded({
    householdName = SEED_HOUSEHOLD_NAME,
    userName = SEED_USER.name,
  }: {
    householdName?: string;
    userName?: string;
  } = {}) {
    await expect(this.page.getByRole('heading', { level: 1 })).toContainText(userName);
    // By testid, not by text or landmark: the sidebar names the household too ('Manage "…"'), and
    // `getByRole('main')` is ambiguous — `SidebarInset` is a <main> and the page renders another
    // inside it.
    await expect(this.page.getByTestId('dashboard-greeting')).toContainText(householdName);
  }

  /**
   * One card, by its title. Each is a labelled `region`, so an assertion can be scoped to the card
   * it means — the dashboard shows six lists at once and a bare `getByText` would find any of them.
   */
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

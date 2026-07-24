import { type Page } from '@playwright/test';

/** The onboarding flow: create a household, then the optional invite step. */
export class OnboardingPage {
  constructor(private readonly page: Page) {}

  /** Enters the flow; a household-less user is routed to create-household. */
  async start() {
    await this.page.goto('/onboarding');
    await this.page.waitForURL(/\/onboarding\/create-household/);
  }

  async createHousehold(name: string) {
    await this.page.getByLabel('Household name').fill(name);
    await this.page.getByRole('button', { name: 'Create' }).click();
    await this.page.waitForURL(/\/onboarding\/invite-members/);
  }

  async skipInvites() {
    await this.page.getByRole('button', { name: 'Skip for now' }).click();
    await this.page.waitForURL((url) => url.pathname === '/');
  }
}

import { expect, type Locator, type Page } from '@playwright/test';

/** The "Manage household members" screen (`/manage/household-members`). */
export class HouseholdMembersPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/manage/household-members');
    // The members table is the default tab; wait for it to render.
    await expect(this.page.getByRole('button', { name: 'Add member' })).toBeVisible();
  }

  /** A members-table row for the given display name. */
  memberRow(name: string): Locator {
    return this.page.getByRole('row').filter({ hasText: name });
  }

  /**
   * Adds a managed (no-account) member via the "Add member" dialog's
   * "Add without account" tab.
   */
  async addManagedMember(name: string) {
    await this.page.getByRole('button', { name: 'Add member' }).click();

    const dialog = this.page.getByRole('dialog');
    await dialog.getByRole('tab', { name: 'Add without account' }).click();
    // exact, so "Name" doesn't also match the "Nickname (optional)" field.
    await dialog.getByLabel('Name', { exact: true }).fill(name);
    await dialog.getByRole('button', { name: 'Add member' }).click();

    // Dialog closes on success.
    await expect(dialog).toBeHidden();
  }

  /** Removes a member via its row action menu (owner-only, no confirm dialog). */
  async removeMember(name: string) {
    const row = this.memberRow(name);
    await row.getByRole('button', { name: 'Open menu' }).click();
    await this.page.getByRole('menuitem', { name: 'Remove member' }).click();
  }
}

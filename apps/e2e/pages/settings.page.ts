import { expect, type Locator, type Page } from '@playwright/test';

/** The household "Settings" screen (`/manage/settings`). */
export class SettingsPage {
  readonly nameInput: Locator;
  readonly deleteButton: Locator;

  constructor(private readonly page: Page) {
    this.nameInput = page.getByLabel('Household name');
    this.deleteButton = page.getByRole('button', { name: 'Delete household' });
  }

  async goto() {
    await this.page.goto('/manage/settings');
    await expect(this.page.getByRole('heading', { name: /household$/ })).toBeVisible();
  }

  /** The "Manage "X" household" heading — reflects the current household name. */
  heading(name: string): Locator {
    return this.page.getByRole('heading', { name: `Manage "${name}" household` });
  }

  /**
   * Renames the household and saves. The field auto-saves on blur, so blurring
   * is the deterministic path — clicking "Save changes" instead races the
   * blur-triggered save, which disables the button before the click lands.
   */
  async setHouseholdName(name: string) {
    await this.nameInput.fill(name);
    await this.nameInput.blur();
  }

  /** Opens the danger-zone delete dialog. */
  async openDeleteDialog(): Promise<Locator> {
    await this.deleteButton.click();
    const dialog = this.page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Are you sure?' })).toBeVisible();
    return dialog;
  }
}

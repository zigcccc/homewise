import { expect, type Page } from '@playwright/test';

/** The Kids list (`/family/kids`) and a child profile's General tab. */
export class KidsPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/family/kids');
    await expect(this.page.getByRole('heading', { name: 'Kids', exact: true })).toBeVisible();
  }

  /** The "Create profile for <name>" suggestion button on the list. */
  createSuggestion(name: string) {
    return this.page.getByRole('button', { name: `Create profile for ${name}` });
  }

  /** A profile card (a link) on the list. */
  profileCard(name: string) {
    return this.page.getByRole('link').filter({ hasText: name });
  }

  /** Creates the profile from its suggestion and waits for the General tab. */
  async createProfileFor(name: string) {
    await this.createSuggestion(name).click();
    await this.page.waitForURL(/\/family\/kids\/\d+\/general/);
  }

  // --- General tab ---

  /** The picture button — labelled "Add a photo" or "Change photo" by current state. */
  get photoButton() {
    return this.page.getByRole('button', { name: /photo/ });
  }

  async setDateOfBirth(displayDate: string) {
    const input = this.page.getByLabel('Date of birth');
    await input.fill(displayDate);
    await input.blur();
  }

  async setSex(label: string) {
    await this.page.getByLabel('Sex').click();
    // exact, so "Male" doesn't also match "Female".
    await this.page.getByRole('option', { name: label, exact: true }).click();
  }

  /** Reveals a masked identifier field (National ID / Tax ID) and fills it. */
  async setMaskedField(id: 'nationalId' | 'taxId', value: string) {
    const group = this.page.locator('[data-slot="input-group"]').filter({ has: this.page.locator(`#${id}`) });
    await group.getByRole('button', { name: 'Edit' }).click();
    await this.page.locator(`#${id}`).fill(value);
  }

  async saveGeneral() {
    await this.page.getByRole('button', { name: 'Save changes' }).click();
    await expect(this.page.getByText('Profile updated.')).toBeVisible();
  }

  /** Uploads a profile photo via the picture dialog, then saves the general form. */
  async uploadPhoto(filePath: string) {
    await this.photoButton.click();
    const dialog = this.page.getByRole('dialog');
    await dialog.locator('input[type="file"]').setInputFiles(filePath);
    await expect(dialog).toBeHidden();
    await this.saveGeneral();
  }

  /** Removes the profile photo via the picture dialog, then saves the general form. */
  async removePhoto() {
    await this.photoButton.click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Remove photo' }).click();
    await expect(dialog).toBeHidden();
    await this.saveGeneral();
  }
}

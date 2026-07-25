import { expect, type Locator, type Page } from '@playwright/test';

/** The Pets list (`/family/pets`) and a pet profile's General tab. */
export class PetsPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/family/pets');
    await expect(this.page.getByRole('heading', { name: 'Pets', exact: true })).toBeVisible();
  }

  createSuggestion(name: string): Locator {
    return this.page.getByRole('button', { name: `Create profile for ${name}` });
  }

  profileCard(name: string): Locator {
    return this.page.getByRole('link').filter({ hasText: name });
  }

  async createProfileFor(name: string) {
    await this.createSuggestion(name).click();
    await this.page.waitForURL(/\/family\/pets\/\d+\/general/);
  }

  // --- General tab ---

  get photoButton(): Locator {
    return this.page.getByRole('button', { name: /photo/ });
  }

  async setType(label: string) {
    await this.page.getByLabel('Type').click();
    await this.page.getByRole('option', { name: label, exact: true }).click();
  }

  async setBreed(value: string) {
    await this.page.getByLabel('Breed').fill(value);
  }

  async setSex(label: string) {
    await this.page.getByLabel('Sex').click();
    // exact, so "Male" doesn't also match "Female".
    await this.page.getByRole('option', { name: label, exact: true }).click();
  }

  async setDateOfBirth(displayDate: string) {
    const input = this.page.getByLabel('Date of birth');
    await input.fill(displayDate);
    await input.blur();
  }

  async setJoinedFamilyOn(displayDate: string) {
    const input = this.page.getByLabel('Joined the family');
    await input.fill(displayDate);
    await input.blur();
  }

  async saveGeneral() {
    await this.page.getByRole('button', { name: 'Save changes' }).click();
    await expect(this.page.getByText('Profile updated.')).toBeVisible();
  }

  async uploadPhoto(filePath: string) {
    await this.photoButton.click();
    const dialog = this.page.getByRole('dialog');
    await dialog.locator('input[type="file"]').setInputFiles(filePath);
    await expect(dialog).toBeHidden();
    await this.saveGeneral();
  }

  async removePhoto() {
    await this.photoButton.click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Remove photo' }).click();
    await expect(dialog).toBeHidden();
    await this.saveGeneral();
  }
}

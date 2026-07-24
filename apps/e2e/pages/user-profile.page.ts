import { expect, type Locator, type Page } from '@playwright/test';

/** The signed-in user's "Your profile" screen (`/user-profile`). */
export class UserProfilePage {
  readonly nameInput: Locator;
  readonly saveButton: Locator;
  readonly fileInput: Locator;
  readonly picturePreview: Locator;
  readonly removePictureButton: Locator;

  constructor(private readonly page: Page) {
    this.nameInput = page.getByLabel('Full name');
    this.saveButton = page.getByRole('button', { name: 'Save changes' });
    this.fileInput = page.locator('input[type="file"]');
    this.picturePreview = page.getByRole('img', { name: 'Preview' });
    this.removePictureButton = page.getByRole('button', { name: 'Remove' });
  }

  async goto() {
    await this.page.goto('/user-profile');
    await expect(this.page.getByRole('heading', { name: 'Your profile' })).toBeVisible();
  }

  /** The breadcrumb page, which renders "<name>'s profile". */
  breadcrumb(name: string): Locator {
    return this.page.getByText(`${name}'s profile`);
  }

  /** Sets the full name and saves. */
  async setName(name: string) {
    await this.nameInput.fill(name);
    await this.saveButton.click();
  }

  /** Uploads a profile picture from disk and saves. */
  async uploadPicture(filePath: string) {
    await this.fileInput.setInputFiles(filePath);
    await this.saveButton.click();
  }

  /** Removes the current profile picture (immediate — no separate save). */
  async removePicture() {
    await this.removePictureButton.click();
  }
}

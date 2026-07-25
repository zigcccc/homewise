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

  /** Sets the full name and saves, waiting for the write to persist. */
  async setName(name: string) {
    await this.nameInput.fill(name);
    await this.saveButton.click();
    await this.expectSaved();
  }

  /** Uploads a profile picture from disk and saves, waiting for the write to persist. */
  async uploadPicture(filePath: string) {
    await this.fileInput.setInputFiles(filePath);
    await this.saveButton.click();
    await this.expectSaved();
  }

  /**
   * Waits for a successful save. The Save button renders only while the form is
   * dirty and unmounts once the mutation resolves and the form resets — so its
   * disappearance is a deterministic "persisted" signal. Without this, the preview
   * shows optimistically from the picked file, so a following removePicture() could
   * fire its DELETE while the upload PATCH is still in flight.
   */
  private async expectSaved() {
    await expect(this.saveButton).toBeHidden();
  }

  /** Removes the current profile picture (immediate — no separate save). */
  async removePicture() {
    await this.removePictureButton.click();
  }
}

import { expect, type Page } from '@playwright/test';

/** The masked identifier fields, keyed by the payload field and named by the label the user reads. */
const identifierLabels = { nationalId: 'National ID', taxId: 'Tax ID' } as const;

type Identifier = keyof typeof identifierLabels;

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

  /**
   * A masked identifier input. Scoped to the form for the same reason `recipes.page.ts` scopes its
   * fields: `getByLabel` matches accessible names by substring, and the router devtools panel — present
   * in `E2E_WEB_MODE=dev` — labels its match rows with serialized search params.
   */
  identifierInput(id: Identifier) {
    return this.page.locator('form').getByLabel(identifierLabels[id]);
  }

  /**
   * The input group wrapping an identifier field, which is what carries its Copy/Hide/Edit actions. Reached
   * upwards from the input rather than by filtering groups on it: `filter({ has })` re-roots its inner
   * locator at each candidate group, where the form-scoped `identifierInput` can never match.
   */
  maskedField(id: Identifier) {
    return this.identifierInput(id).locator('xpath=ancestor::*[@data-slot="input-group"]');
  }

  /** The pencil that reveals a masked identifier. Absent while the field is empty — it is already editable. */
  editIdentifierButton(id: Identifier) {
    return this.maskedField(id).getByRole('button', { name: 'Edit' });
  }

  /** Reveals a masked identifier field and fills it. An empty field is already editable, so it has no pencil. */
  async setMaskedField(id: Identifier, value: string) {
    if (await this.editIdentifierButton(id).count()) {
      await this.editIdentifierButton(id).click();
    }

    await this.identifierInput(id).fill(value);
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

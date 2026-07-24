import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The "Medical information" card shared by child and pet General tabs — the
 * medical ID field and the linked-contacts list.
 */
export class MedicalPage {
  constructor(private readonly page: Page) {}

  /** A linked-contact list item by name. */
  contactItem(name: string): Locator {
    return this.page.getByRole('listitem').filter({ hasText: name });
  }

  async setMedicalId(value: string) {
    await this.page.getByLabel('Medical ID number').fill(value);
    // Only the medical form is dirty here, so this is the only "Save changes".
    await this.page.getByRole('button', { name: 'Save changes' }).click();
    await expect(this.page.getByText('Medical information updated.')).toBeVisible();
  }

  /** Creates a new contact via the "Add contact" combobox → "Create new contact". */
  async addContact(name: string) {
    await this.page.getByRole('button', { name: 'Add contact' }).click();
    // "Create new contact" is a combobox action button, not a selectable option.
    await this.page.getByRole('button', { name: 'Create new contact' }).click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByLabel('Name', { exact: true }).fill(name);
    await dialog.getByRole('button', { name: 'Create contact' }).click();
    await expect(dialog).toBeHidden();
  }

  async editContact(currentName: string, newName: string) {
    await this.page.getByRole('button', { name: `Edit ${currentName}` }).click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByLabel('Name', { exact: true }).fill(newName);
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toBeHidden();
  }

  /** Links an existing household contact via the combobox. */
  async linkExistingContact(name: string) {
    await this.page.getByRole('button', { name: 'Add contact' }).click();
    await this.page.getByRole('option', { name }).click();
  }

  async removeContact(name: string) {
    await this.page.getByRole('button', { name: `Remove ${name}` }).click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Remove' }).click();
    await expect(dialog).toBeHidden();
  }
}

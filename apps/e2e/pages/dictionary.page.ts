import { expect, type Locator, type Page } from '@playwright/test';

/** A child profile's Dictionary tab (`/family/kids/$id/dictionary`). */
export class DictionaryPage {
  constructor(private readonly page: Page) {}

  /** Switches to the Dictionary tab (from anywhere on the profile). */
  async open() {
    await this.page.getByRole('tab', { name: 'Dictionary' }).click();
    await expect(this.page.getByRole('button', { name: 'Add word' })).toBeVisible();
  }

  /** A dictionary-table row containing the given phrase. */
  row(phrase: string): Locator {
    return this.page.getByRole('row').filter({ hasText: phrase });
  }

  async addWord(childPhrase: string, adultTranslation: string) {
    await this.page.getByRole('button', { name: 'Add word' }).click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByLabel('Child phrase').fill(childPhrase);
    await dialog.getByLabel('Adult translation').fill(adultTranslation);
    await dialog.getByRole('button', { name: 'Add word' }).click();
    await expect(dialog).toBeHidden();
  }

  async editWord(currentPhrase: string, newPhrase: string) {
    await this.openRowMenu(currentPhrase);
    await this.page.getByRole('menuitem', { name: 'Edit word' }).click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByLabel('Child phrase').fill(newPhrase);
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
  }

  async archiveWord(phrase: string) {
    await this.openRowMenu(phrase);
    await this.page.getByRole('menuitem', { name: 'Archive word' }).click();
  }

  async restoreWord(phrase: string) {
    await this.openRowMenu(phrase);
    await this.page.getByRole('menuitem', { name: 'Restore word' }).click();
  }

  async deleteWord(phrase: string) {
    await this.openRowMenu(phrase);
    await this.page.getByRole('menuitem', { name: 'Delete word' }).click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Delete word' }).click();
    await expect(dialog).toBeHidden();
  }

  /**
   * Types into the search box and waits for the URL to catch up. The input debounces for 400ms
   * before navigating, so without this the next action can fire while the table is re-rendering and
   * click a row that is about to detach.
   */
  async search(term: string) {
    await this.page.getByPlaceholder('Search words or translations').fill(term);
    await this.page.waitForURL((url) =>
      term === '' ? !url.searchParams.has('search') : url.searchParams.get('search') === term
    );
  }

  async toggleShowArchived() {
    await this.page.getByLabel('Show archived').click();
  }

  async toggleSortDirection() {
    await this.page.getByRole('button', { name: /Asc|Desc/ }).click();
  }

  private async openRowMenu(phrase: string) {
    // Settle on the row before reaching into it, so the click can't land mid-rerender.
    await expect(this.row(phrase)).toBeVisible();
    await this.row(phrase).getByRole('button', { name: 'Open menu' }).click();
  }
}

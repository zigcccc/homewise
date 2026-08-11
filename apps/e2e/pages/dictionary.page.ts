import { expect, type Page } from '@playwright/test';

import { SORT_DIRECTION_NAME } from '../support/text';
import { SearchBox } from './search-box';

/** A child profile's Dictionary tab (`/family/kids/$id/dictionary`). */
export class DictionaryPage {
  private readonly searchBox: SearchBox;

  constructor(private readonly page: Page) {
    this.searchBox = new SearchBox(page, 'Search words or translations');
  }

  /** Switches to the Dictionary tab (from anywhere on the profile). */
  async open() {
    await this.page.getByRole('tab', { name: 'Dictionary' }).click();
    await expect(this.page.getByRole('button', { name: 'Add word' })).toBeVisible();
  }

  /** A dictionary-table row containing the given phrase. */
  row(phrase: string) {
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

  /** Searches the list; the SearchBox waits out the debounce so the next step can't race it. */
  async search(term: string) {
    await this.searchBox.fill(term);
  }

  async toggleShowArchived() {
    await this.page.getByLabel('Show archived').click();
  }

  async toggleSortDirection() {
    await this.page.getByRole('button', { name: SORT_DIRECTION_NAME }).click();
  }

  private async openRowMenu(phrase: string) {
    // Settle on the row before reaching into it, so the click can't land mid-rerender.
    await expect(this.row(phrase)).toBeVisible();
    await this.row(phrase).getByRole('button', { name: 'Open menu' }).click();
  }
}

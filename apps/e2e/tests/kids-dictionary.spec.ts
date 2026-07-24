import { expect, test } from '@playwright/test';

import { DictionaryPage } from '../pages/dictionary.page';
import { createChildProfile, removeManagedMember } from '../support/profiles';

test.describe('child dictionary', () => {
  test('adds, edits, searches, archives, restores, and deletes words', async ({ page }) => {
    const kidName = `E2E Dict Kid ${Date.now()}`;
    await createChildProfile(page, kidName);

    try {
      const dictionary = new DictionaryPage(page);
      await dictionary.open();

      const stamp = Date.now();
      const phrase = `nana-${stamp}`;
      const renamed = `${phrase}-x`;
      const other = `wawa-${stamp}`;

      // Add + edit.
      await dictionary.addWord(phrase, 'banana');
      await expect(dictionary.row(phrase)).toBeVisible();
      await dictionary.editWord(phrase, renamed);
      await expect(dictionary.row(renamed)).toBeVisible();

      // A second word so search actually filters.
      await dictionary.addWord(other, 'water');
      await dictionary.search(renamed);
      await expect(dictionary.row(renamed)).toBeVisible();
      await expect(dictionary.row(other)).toBeHidden();
      await dictionary.search('');
      await expect(dictionary.row(other)).toBeVisible();

      // Archive hides by default; "Show archived" reveals it; restore brings it back.
      await dictionary.archiveWord(renamed);
      await expect(dictionary.row(renamed)).toBeHidden();
      await dictionary.toggleShowArchived();
      await expect(dictionary.row(renamed)).toBeVisible();
      await dictionary.restoreWord(renamed);
      await dictionary.toggleShowArchived();
      await expect(dictionary.row(renamed)).toBeVisible();

      // Sort direction toggles without error, then delete both words.
      await dictionary.toggleSortDirection();
      await dictionary.deleteWord(renamed);
      await expect(dictionary.row(renamed)).toBeHidden();
      await dictionary.deleteWord(other);
      await expect(dictionary.row(other)).toBeHidden();
    } finally {
      await removeManagedMember(page, kidName);
    }
  });
});

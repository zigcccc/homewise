import { DictionaryPage } from '../pages/dictionary.page';
import { createChildProfile } from '../support/profiles';
import { deleteMemberNamed } from '../support/records';
import { expect, test } from '../support/test';

test.describe('child dictionary', () => {
  test('adds, edits, searches, archives, restores, and deletes words', async ({ cleanup, page }) => {
    // The longest journey in the suite: profile setup + ~15 dictionary round-trips. It fits the
    // default budget locally, but each op is slower on a loaded CI runner. Triple the budget for
    // this one spec rather than split it (splitting would re-run the expensive profile setup per
    // part and cost more) — and being the likeliest spec here to overrun, it is also the one whose
    // teardown most needs to survive that.
    test.slow();

    const kidName = `E2E Dict Kid ${Date.now()}`;

    // Eligible for meals, so a leftover turns the meal plan's coverage spec red on this worker.
    cleanup.add((api) => deleteMemberNamed(api, kidName));
    await createChildProfile(page, kidName);

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
  });
});

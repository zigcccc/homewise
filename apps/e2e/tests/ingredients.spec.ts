import { SEED_INGREDIENTS, SEED_RECIPE, SEED_STORES } from '@homewise/server/seed-fixtures';

import { IngredientsPage } from '../pages/ingredients.page';
import { API_URL } from '../playwright.config';
import { expect, test } from '../support/test';

test.describe('ingredient library', () => {
  // Every spec is self-contained: it creates uniquely-named data and removes it, so it's
  // idempotent across reruns and never mutates the shared seed fixtures.

  test('adds, edits, searches and deletes an ingredient', async ({ page }) => {
    const ingredients = new IngredientsPage(page);
    await ingredients.goto();

    const name = `E2E Ingredient ${Date.now()}`;

    try {
      await ingredients.add(name, 'Produce');
      await expect(ingredients.row(name)).toBeVisible();
      await expect(ingredients.row(name)).toContainText('Produce');

      // A brand-new ingredient belongs to no recipe yet.
      await expect(ingredients.row(name)).toContainText('0 recipes');

      await ingredients.editCategory(name, 'Spices');
      await expect(ingredients.row(name)).toContainText('Spices');

      // Search filters down to just this row; a seeded staple drops out.
      await ingredients.search(name);
      await expect(ingredients.row(name)).toBeVisible();
      await expect(ingredients.row(SEED_INGREDIENTS[0].name)).toBeHidden();
      await ingredients.search('');
      await expect(ingredients.row(SEED_INGREDIENTS[0].name)).toBeVisible();
    } finally {
      await ingredients.delete(name);
      await expect(ingredients.row(name)).toBeHidden();
    }
  });

  test('edits category, default unit and name inline', async ({ page }) => {
    const ingredients = new IngredientsPage(page);
    await ingredients.goto();

    const name = `E2E Inline ${Date.now()}`;
    const renamed = `${name} renamed`;

    try {
      await ingredients.add(name, 'Produce');

      // The whole point of editing in the table: no dialog round-trip per field.
      await ingredients.setCategoryInline(name, 'Spices');
      await expect(ingredients.row(name)).toContainText('Spices');

      // A recipe-born ingredient lands with no default unit, and this is where that gets fixed.
      await ingredients.setDefaultUnitInline(name, 'tbsp');
      await expect(ingredients.row(name)).toContainText('tbsp');

      // Opening the editor must not resize the row: it stacks into the same grid cell as the hidden
      // sizer that holds the column open, and an unplaced one opens a second row of empty space
      // above itself instead.
      const resting = await ingredients.row(name).boundingBox();
      await ingredients.openInlineRename(name, renamed);
      expect((await ingredients.row(name).boundingBox())!.height).toBeCloseTo(resting!.height, 0);

      await ingredients.commitInlineRename();
      await expect(ingredients.row(renamed)).toBeVisible();

      // Both inline edits survived the rename's refetch rather than being read back off a stale row.
      await expect(ingredients.row(renamed)).toContainText('Spices');
      await expect(ingredients.row(renamed)).toContainText('tbsp');
    } finally {
      await ingredients.goto();
      await ingredients.deleteIfPresent(renamed);
      await ingredients.deleteIfPresent(name);
    }
  });

  test('assigns a shop inline and filters the library by it', async ({ page }) => {
    const ingredients = new IngredientsPage(page);
    await ingredients.goto();

    const name = `E2E Shopped ${Date.now()}`;
    // A seeded ingredient assigned to the *other* shop, so filtering has something to exclude.
    const elsewhere = SEED_INGREDIENTS.find((fixture) => fixture.store === SEED_STORES[1].name)!;

    try {
      await ingredients.add(name);
      // A brand-new ingredient has no shop until someone says where they buy it.
      await expect(ingredients.row(name)).toContainText('—');

      await ingredients.setStoreInline(name, SEED_STORES[0].name);
      await expect(ingredients.row(name)).toContainText(SEED_STORES[0].name);

      await ingredients.filterByStore(SEED_STORES[0].name);
      await expect(ingredients.row(name)).toBeVisible();
      await expect(ingredients.row(elsewhere.name)).toBeHidden();

      // "No shop" is its own filter — the ingredients nobody has placed yet.
      await ingredients.filterByStore('No shop');
      await expect(ingredients.row(name)).toBeHidden();

      await ingredients.clearStoreFilter();
      await expect(ingredients.row(name)).toBeVisible();
      await expect(ingredients.row(elsewhere.name)).toBeVisible();
    } finally {
      await ingredients.goto();
      await ingredients.deleteIfPresent(name);
    }
  });

  test('keeps an open inline rename on its own row when the list shifts underneath it', async ({ page }) => {
    const ingredients = new IngredientsPage(page);
    await ingredients.goto();

    const stamp = Date.now();
    // Two adjacent names, so the row that arrives lands directly above the one being renamed and
    // nothing else can end up between them — the shift is exactly one position, and both rows
    // belong to this spec.
    const neighbour = `E2E Shift ${stamp} a`;
    const mine = `E2E Shift ${stamp} b`;
    const renamed = `E2E Shifted ${stamp}`;

    try {
      await ingredients.add(mine);

      await ingredients.openInlineRename(mine, renamed);

      // Another member adds an ingredient that sorts above this one. Realtime refetches the list
      // under the open editor, so every row below the new one moves down a place.
      const response = await page.context().request.post(`${API_URL}/ingredients`, { data: { name: neighbour } });
      expect(response.ok()).toBe(true);
      await expect(ingredients.row(neighbour)).toBeVisible();

      await ingredients.commitInlineRename();

      // The rename has to follow the row it was opened on. Keyed by position, the editor would have
      // moved onto whichever ingredient took the old index — renaming a row the user never touched
      // and leaving theirs untouched.
      await expect(ingredients.row(renamed)).toBeVisible();
      await expect(ingredients.row(neighbour)).toBeVisible();
      await expect(ingredients.row(mine)).toBeHidden();
    } finally {
      await ingredients.goto();
      await ingredients.deleteIfPresent(renamed);
      await ingredients.deleteIfPresent(mine);
      await ingredients.deleteIfPresent(neighbour);
    }
  });

  test('refuses an inline rename onto a name already in the library', async ({ page }) => {
    const ingredients = new IngredientsPage(page);
    await ingredients.goto();

    const name = `E2E Inline Clash ${Date.now()}`;

    try {
      await ingredients.add(name);

      // Escaping abandons a rename rather than committing it — the row keeps its own name.
      await ingredients.openInlineRename(name, `${name} escaped`);
      await ingredients.cancelInlineRename();
      await expect(ingredients.row(`${name} escaped`)).toBeHidden();

      // The 409 toasts instead of closing the editor, so the typed value isn't lost.
      const toasts = await ingredients.renameInlineExpectingError(name, SEED_INGREDIENTS[0].name);
      await expect(toasts).toContainText('already in your ingredient library');

      // Clicking away from a refused value abandons the edit. It must not re-send it — a rejection
      // that re-fires on every blur would trap you in the cell.
      await ingredients.blurInlineRename();
      await expect(ingredients.row(name)).toBeVisible();
    } finally {
      await ingredients.goto();
      await ingredients.deleteIfPresent(name);
    }
  });

  test('refuses a duplicate name, case-insensitively', async ({ page }) => {
    const ingredients = new IngredientsPage(page);
    await ingredients.goto();

    // Upper-cased so this also proves the dedup ignores case — the whole point of the
    // lower(name) unique index that keeps shopping lists from fragmenting later.
    const dialog = await ingredients.addExpectingError(SEED_INGREDIENTS[0].name.toUpperCase());

    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('already in your ingredient library');
  });

  test('refuses to delete an ingredient a recipe still uses', async ({ page }) => {
    const ingredients = new IngredientsPage(page);
    await ingredients.goto();

    // The seeded recipe uses this one, so the server must block the delete.
    const inUse = SEED_RECIPE.ingredients[0].name;

    await expect(ingredients.row(inUse)).toContainText('1 recipe');

    const dialog = await ingredients.openDeleteExpectingRefusal(inUse);
    await expect(dialog).toBeVisible();

    // Blocked before it's attempted: the server would refuse anyway, so the dialog says why and
    // disables the confirm instead of round-tripping to a 409 toast.
    await expect(dialog).toContainText('Remove it from them before deleting it');
    await expect(dialog.getByRole('button', { name: 'Delete ingredient' })).toBeDisabled();

    // Dismiss the dialog and confirm the row survived.
    await page.keyboard.press('Escape');
    await ingredients.goto();
    await expect(ingredients.row(inUse)).toBeVisible();
  });
});

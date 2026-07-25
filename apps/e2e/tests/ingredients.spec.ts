import { expect, test } from '@playwright/test';

import { SEED_INGREDIENTS, SEED_RECIPE } from '@homewise/server/seed-fixtures';

import { IngredientsPage } from '../pages/ingredients.page';

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

    const dialog = await ingredients.deleteExpectingRefusal(inUse);
    await expect(dialog).toBeVisible();

    // Dismiss the dialog and confirm the row survived.
    await page.keyboard.press('Escape');
    await ingredients.goto();
    await expect(ingredients.row(inUse)).toBeVisible();
  });
});

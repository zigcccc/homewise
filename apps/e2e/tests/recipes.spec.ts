import { expect, test } from '@playwright/test';

import { SEED_INGREDIENTS, SEED_RECIPE } from '@homewise/server/seed-fixtures';

import { IngredientsPage } from '../pages/ingredients.page';
import { RecipesPage } from '../pages/recipes.page';

test.describe('recipes', () => {
  // Every spec is self-contained: it creates uniquely-named data and removes it, so it's
  // idempotent across reruns and never mutates the shared seed fixtures.

  test('creates a full recipe, then favorites, archives, restores and deletes it', async ({ page }) => {
    // The longest journey here: a create form with ingredients, steps and tags, then five
    // detail round-trips and teardown. Same reasoning as the dictionary spec.
    test.slow();

    const recipes = new RecipesPage(page);
    const ingredients = new IngredientsPage(page);
    const stamp = Date.now();
    const title = `E2E Recipe ${stamp}`;
    // Uniquely named so the create-on-the-fly path can't collide with the seeded library.
    const typoIngredient = `E2E Spice ${stamp} typo`;
    const newIngredient = `E2E Spice ${stamp}`;

    await recipes.goto();
    await recipes.openNewForm();

    try {
      await recipes.fillTitle(title);
      await recipes.fillNumber('Servings', '2');
      await recipes.selectMealType('Dinner');

      // One ingredient picked from the library, one named through the combobox's create action.
      await recipes.addExistingIngredient(SEED_INGREDIENTS[0].name);
      await recipes.setIngredientQuantity(SEED_INGREDIENTS[0].name, '2');
      await recipes.createAndAddIngredient(typoIngredient);

      // A named ingredient isn't persisted until the recipe is saved, so a typo is still fixable —
      // that's the whole point of deferring creation, and the regression most worth pinning.
      await recipes.renameNewIngredient(typoIngredient, newIngredient);
      await recipes.setIngredientQuantity(newIngredient, '1');

      await recipes.addStep('First step.');
      await recipes.addStep('Second step.');
      await recipes.addStep('Third step.');

      // A comma splits the input into separate tags, so a run of them needs no extra clicks.
      await recipes.addTags(`e2e-${stamp}, e2e-second-${stamp}`);
      await expect(recipes.tagChip(`e2e-${stamp}`)).toBeVisible();
      await expect(recipes.tagChip(`e2e-second-${stamp}`)).toBeVisible();

      await recipes.save('Save recipe');

      // Saving lands on the detail view.
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await expect(recipes.detailStep('First step.')).toBeVisible();
      await expect(recipes.detailStep('Third step.')).toBeVisible();
      await expect(recipes.detailIngredient(SEED_INGREDIENTS[0].name)).toBeVisible();
      await expect(recipes.detailIngredient(newIngredient)).toBeVisible();

      // Scaling servings scales the quantities with them: 2 servings of "2" → 4 at 4 servings.
      await expect(recipes.servings()).toHaveText('2');
      await recipes.setServings('more');
      await expect(recipes.servings()).toHaveText('3');

      // The count you're cooking for lives in the URL, so it survives a reload instead of snapping
      // back to what the recipe says — the reason it isn't component state.
      await page.reload();
      await expect(recipes.servings()).toHaveText('3');

      // Favoriting surfaces it under the favorites filter.
      await recipes.toggleFavorite();
      await recipes.goto();
      await recipes.toggleFavoritesFilter();
      await expect(recipes.card(title)).toBeVisible();
      await recipes.toggleFavoritesFilter();

      // Archiving drops it out of the default list; "Show archived" brings it back.
      await recipes.open(title);
      await recipes.archive();

      await recipes.goto();
      await expect(recipes.card(title)).toBeHidden();
      await recipes.toggleShowArchived();
      await expect(recipes.card(title)).toBeVisible();

      await recipes.open(title);
      await recipes.restore();

      await recipes.goto();
      await expect(recipes.card(title)).toBeVisible();

      // Saving is the only thing that touched the library: the corrected name is there, and the
      // typo it was renamed from never was — nothing is persisted while the form is still open.
      await ingredients.goto();
      await expect(ingredients.row(newIngredient)).toBeVisible();
      await expect(ingredients.row(typoIngredient)).toBeHidden();
    } finally {
      // Best-effort throughout: a failure above must not be masked by cleanup throwing over a row
      // that was never created.
      await recipes.goto();
      await recipes.deleteIfPresent(title);
      await expect(recipes.card(title)).toBeHidden();

      // The ingredient the recipe minted outlives it — clean that up too. Deleted straight from the
      // unfiltered list: searching first re-renders the table on a 400ms debounce, which detaches
      // the row mid-click.
      await ingredients.goto();
      await ingredients.deleteIfPresent(newIngredient);
    }
  });

  test('edits a recipe', async ({ page }) => {
    const recipes = new RecipesPage(page);
    const stamp = Date.now();
    const title = `E2E Edit ${stamp}`;
    const renamed = `${title} renamed`;

    await recipes.goto();
    await recipes.openNewForm();
    await recipes.fillTitle(title);
    await recipes.addStep('Only step.');
    await recipes.save('Save recipe');
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();

    try {
      await recipes.openEditForm();
      await recipes.fillTitle(renamed);
      await recipes.fillNumber('Cook time (min)', '25');
      await recipes.save('Save changes');

      await expect(page.getByRole('heading', { level: 1, name: renamed })).toBeVisible();
      // "Cook 25 min", not a bare "25 min" — the header also renders a "25 min total".
      await expect(page.getByText('Cook 25 min')).toBeVisible();
    } finally {
      // Tolerant of either name: if the rename assertion above failed, cleanup must still remove
      // the row — and must not throw over it, which would mask the real failure.
      await recipes.goto();
      await recipes.deleteIfPresent(renamed);
      await recipes.deleteIfPresent(title);
    }
  });

  test('finds a recipe by an ingredient it contains', async ({ page }) => {
    const recipes = new RecipesPage(page);
    await recipes.goto();

    // The seeded recipe's title says nothing about this ingredient — only its ingredient list
    // does. This is the search behavior the whole reusable-ingredient design exists to enable.
    // (Index 2 deliberately: "Garlic" and "Butter" both appear in the title, so neither would
    // prove the search reached through to the ingredient list.)
    const hiddenIngredient = SEED_RECIPE.ingredients[2].name;
    expect(SEED_RECIPE.title.toLowerCase()).not.toContain(hiddenIngredient.toLowerCase());

    await recipes.search(hiddenIngredient);
    await expect(recipes.card(SEED_RECIPE.title)).toBeVisible();

    // A term that matches nothing anywhere clears the list and shows the filtered empty state.
    await recipes.search(`nothing-matches-${Date.now()}`);
    await expect(page.getByText('No matching recipes')).toBeVisible();
  });

  test('filters by meal type', async ({ page }) => {
    const recipes = new RecipesPage(page);
    await recipes.goto();

    await recipes.filterByMealType('Dinner');
    await expect(recipes.card(SEED_RECIPE.title)).toBeVisible();

    await recipes.filterByMealType('Breakfast');
    await expect(recipes.card(SEED_RECIPE.title)).toBeHidden();
  });

  test('sorts the list in both directions', async ({ page }) => {
    const recipes = new RecipesPage(page);
    await recipes.goto();

    // Ascending by title is the default.
    await expect(recipes.sortDirectionButton()).toHaveText('A → Z');

    await recipes.toggleSortDirection();
    await expect(recipes.sortDirectionButton()).toHaveText('Z → A');
    // The toggle drives the search param the loader forwards to the server, not just the label.
    await page.waitForURL((url) => url.searchParams.get('sortDirection') === 'desc');
    await expect(recipes.card(SEED_RECIPE.title)).toBeVisible();

    // The label follows the column: "descending" on a date reads as newest-first, not Z → A.
    await recipes.selectSortKey('Date added');
    await expect(recipes.sortDirectionButton()).toHaveText('Newest first');
  });

  test('rejects a recipe with no title', async ({ page }) => {
    const recipes = new RecipesPage(page);
    await recipes.goto();
    await recipes.openNewForm();

    await recipes.save('Save recipe');

    await expect(page.getByText('Title must contain at least 1 character')).toBeVisible();
    // Still on the form — a rejected save must not navigate away and lose the user's work.
    await expect(page.getByRole('heading', { level: 1, name: 'Add a recipe' })).toBeVisible();
  });
});

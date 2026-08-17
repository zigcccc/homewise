import { SEED_INGREDIENTS, SEED_STORES } from '@homewise/server/seed-fixtures';

import { IngredientsPage } from '../pages/ingredients.page';
import { StoresPage } from '../pages/stores.page';
import { expect, test } from '../support/test';

test.describe('shops', () => {
  // Every spec is self-contained: it creates uniquely-named data and removes it, so it's
  // idempotent across reruns and never mutates the shared seed fixtures.

  test('reaches the Shops tab from the ingredients page and back', async ({ page }) => {
    const ingredients = new IngredientsPage(page);
    const stores = new StoresPage(page);

    await ingredients.goto();

    // Through the tab bar, not the address bar: a `goto` would pass even if the trigger were inert.
    await stores.openFromTab();
    await expect(page).toHaveURL(/\/food\/ingredients\/stores/);
    await expect(stores.row(SEED_STORES[0].name)).toBeVisible();

    await page.getByRole('tab', { name: 'Ingredients' }).click();
    await expect(page).toHaveURL(/\/food\/ingredients(\?|$)/);
    await expect(ingredients.row(SEED_INGREDIENTS[0].name)).toBeVisible();
  });

  test('adds, renames, searches and deletes a shop', async ({ page }) => {
    const stores = new StoresPage(page);
    await stores.goto();

    const name = `E2E Shop ${Date.now()}`;
    const renamed = `${name} renamed`;

    try {
      await stores.add(name, 'Corner branch');
      await expect(stores.row(name)).toBeVisible();
      await expect(stores.row(name)).toContainText('Corner branch');

      // Nothing is bought here yet.
      await expect(stores.row(name)).toContainText('0 ingredients');

      await stores.renameInline(name, renamed);
      await expect(stores.row(renamed)).toBeVisible();
      // The notes survived the rename's refetch rather than being read back off a stale row.
      await expect(stores.row(renamed)).toContainText('Corner branch');

      // Search filters down to just this row; a seeded shop drops out.
      await stores.search(renamed);
      await expect(stores.row(renamed)).toBeVisible();
      await expect(stores.row(SEED_STORES[0].name)).toBeHidden();
      await stores.search('');
      await expect(stores.row(SEED_STORES[0].name)).toBeVisible();
    } finally {
      await stores.goto();
      await stores.deleteIfPresent(renamed);
      await stores.deleteIfPresent(name);
    }

    await expect(stores.row(renamed)).toBeHidden();
  });

  test('refuses a duplicate shop name, case-insensitively', async ({ page }) => {
    const stores = new StoresPage(page);
    await stores.goto();

    // Upper-cased so this also proves the dedup ignores case — the lower(name) unique index is what
    // keeps one shop from claiming two sections of the same shopping list.
    const dialog = await stores.addExpectingError(SEED_STORES[0].name.toUpperCase());

    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('is already a shop');

    await page.keyboard.press('Escape');
  });

  test('creates a shop on the fly while adding an ingredient', async ({ page }) => {
    const ingredients = new IngredientsPage(page);
    const stores = new StoresPage(page);

    const stamp = Date.now();
    const shop = `E2E Inline Shop ${stamp}`;
    const ingredient = `E2E Inline Shopped ${stamp}`;

    try {
      await ingredients.goto();
      await ingredients.addWithNewStore(ingredient, shop);

      // One save created both, and the ingredient came back already filed under the new shop.
      await expect(ingredients.row(ingredient)).toContainText(shop);

      // The shop is a real row now, reachable from the Shops tab and knowing what it's used for.
      await stores.goto();
      await expect(stores.row(shop)).toBeVisible();
      await expect(stores.row(shop)).toContainText('1 ingredient');
    } finally {
      await ingredients.goto();
      await ingredients.deleteIfPresent(ingredient);
      await stores.goto();
      await stores.deleteIfPresent(shop);
    }
  });

  test('creates a shop on the fly from the ingredients table', async ({ page }) => {
    const ingredients = new IngredientsPage(page);
    const stores = new StoresPage(page);

    const stamp = Date.now();
    const shop = `E2E Cell Shop ${stamp}`;
    const ingredient = `E2E Cell Shopped ${stamp}`;
    // A second row of this spec's own, so proving the new shop is offered to *other* rows doesn't
    // mean mutating a shared seed ingredient — this project runs fully parallel.
    const neighbour = `E2E Cell Neighbour ${stamp}`;

    try {
      await ingredients.goto();
      await ingredients.add(ingredient);
      await ingredients.add(neighbour);
      await expect(ingredients.row(ingredient)).toContainText('—');

      // The cell commits on change, so naming a shop here both creates it and files the row under
      // it in one patch — no trip to the Shops tab to add it first.
      await ingredients.createStoreInline(ingredient, shop);
      await expect(ingredients.row(ingredient)).toContainText(shop);

      // It's a library row now, not private to the cell that minted it: another row can pick it.
      await ingredients.setStoreInline(neighbour, shop);
      await expect(ingredients.row(neighbour)).toContainText(shop);

      await stores.goto();
      await expect(stores.row(shop)).toContainText('2 ingredients');
    } finally {
      await ingredients.goto();
      await ingredients.deleteIfPresent(ingredient);
      await ingredients.deleteIfPresent(neighbour);
      await stores.goto();
      await stores.deleteIfPresent(shop);
    }
  });

  test('does not create the shop when the ingredient save is refused', async ({ page }) => {
    const ingredients = new IngredientsPage(page);
    const stores = new StoresPage(page);

    const shop = `E2E Orphan Shop ${Date.now()}`;

    try {
      await ingredients.goto();

      // A duplicate ingredient name, refused by the server. Naming a shop in the same payload must
      // not mint it: the name check runs before anything is written, so the 409 leaves nothing
      // behind. (The concurrent-duplicate case is covered by the write's transaction instead, which
      // needs a race no test can reliably provoke — this covers the ordering, not that rollback.)
      await ingredients.addWithNewStoreExpectingError(SEED_INGREDIENTS[0].name, shop);

      await page.keyboard.press('Escape');
      await stores.goto();
      await expect(stores.row(shop)).toBeHidden();
    } finally {
      await stores.goto();
      await stores.deleteIfPresent(shop);
    }
  });

  test('deleting a shop clears it off its ingredients rather than blocking', async ({ page }) => {
    const ingredients = new IngredientsPage(page);
    const stores = new StoresPage(page);

    const shop = `E2E Doomed Shop ${Date.now()}`;
    const ingredient = `E2E Shopped ${Date.now()}`;

    try {
      await stores.goto();
      await stores.add(shop);

      await ingredients.goto();
      await ingredients.add(ingredient);
      await ingredients.setStoreInline(ingredient, shop);
      await expect(ingredients.row(ingredient)).toContainText(shop);

      // The shop now knows it's used, and says so before deleting — but doesn't refuse, because a
      // default shop is a preference, not content worth protecting.
      await stores.goto();
      await expect(stores.row(shop)).toContainText('1 ingredient');

      const dialog = await stores.openDelete(shop);
      await expect(dialog).toContainText('will keep their place in the library');
      await expect(dialog.getByRole('button', { name: 'Delete shop' })).toBeEnabled();
      await dialog.getByRole('button', { name: 'Delete shop' }).click();
      await expect(dialog).toBeHidden();
      await expect(stores.row(shop)).toBeHidden();

      // The ingredient survived, minus its shop.
      await ingredients.goto();
      await expect(ingredients.row(ingredient)).toBeVisible();
      await expect(ingredients.row(ingredient)).not.toContainText(shop);
    } finally {
      await ingredients.goto();
      await ingredients.deleteIfPresent(ingredient);
      await stores.goto();
      await stores.deleteIfPresent(shop);
    }
  });
});

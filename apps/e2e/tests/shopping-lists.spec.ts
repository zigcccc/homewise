import { expect, test } from '@playwright/test';

import { SEED_INGREDIENTS, SEED_STORES } from '@homewise/server/seed-fixtures';

import { IngredientsPage } from '../pages/ingredients.page';
import { ShoppingListsPage } from '../pages/shopping-lists.page';

/** Two seeded ingredients from one shop, one from another, one from none — the grouping this is for. */
const [SPAR, HOFER] = SEED_STORES;
const sparIngredients = SEED_INGREDIENTS.filter((row) => row.store === SPAR.name);
const hoferIngredient = SEED_INGREDIENTS.find((row) => row.store === HOFER.name)!;
const shoplessIngredient = SEED_INGREDIENTS.find((row) => row.store === null)!;

test.describe('shopping lists', () => {
  // Every spec creates its own list and deletes it by id. Lists are labelled from their sections, so
  // two specs running in parallel routinely produce the same label — the id is the only safe handle.

  test('files ingredients under the shop they are bought at', async ({ page }) => {
    const lists = new ShoppingListsPage(page);
    await lists.goto();
    const listId = await lists.createList();

    try {
      // Two from the same shop must share one heading, not open a second.
      await lists.addIngredient(sparIngredients[0]!.name);
      await expect(lists.section(SPAR.name)).toBeVisible();
      await lists.addIngredient(sparIngredients[1]!.name);
      await expect(page.getByRole('heading', { level: 2, name: SPAR.name })).toHaveCount(1);
      await expect(lists.itemsUnder(SPAR.name)).toHaveCount(2);

      // A different shop gets its own heading.
      await lists.addIngredient(hoferIngredient.name);
      await expect(lists.itemsUnder(HOFER.name)).toHaveCount(1);

      // An ingredient with no shop has nothing to go on and stays ungrouped.
      await lists.addIngredient(shoplessIngredient.name);
      await expect(lists.ungroupedItems()).toHaveCount(1);

      // The list names itself from its sections rather than sitting there unnamed.
      await expect(lists.listLink(listId)).toContainText(`${SPAR.name}, ${HOFER.name}`);
    } finally {
      await lists.deleteListIfPresent(listId);
    }
  });

  test('adds a one-off without putting it in the ingredient library', async ({ page }) => {
    const lists = new ShoppingListsPage(page);
    const ingredients = new IngredientsPage(page);

    const oneOff = `E2E Batteries ${Date.now()}`;

    await lists.goto();
    const listId = await lists.createList();

    try {
      await lists.addOneOff(oneOff);
      await expect(lists.ungroupedItems()).toHaveCount(1);

      // The whole point of a one-off: it's on the list, and the pantry vocabulary is untouched.
      await ingredients.goto();
      await ingredients.search(oneOff);
      await expect(ingredients.row(oneOff)).toBeHidden();
    } finally {
      await lists.deleteListIfPresent(listId);
    }
  });

  test('ticks and unticks an item', async ({ page }) => {
    const lists = new ShoppingListsPage(page);
    await lists.goto();
    const listId = await lists.createList();

    const name = sparIngredients[0]!.name;

    try {
      await lists.addIngredient(name);
      await expect(lists.progress()).toHaveText('0 of 1 ticked');

      await lists.tick(name);
      await expect(lists.isTicked(name)).toBeVisible();
      await expect(lists.progress()).toHaveText('1 of 1 ticked');

      // Correcting a mis-tap has to work — that's the only reason unticking exists.
      await lists.untick(name);
      await expect(lists.progress()).toHaveText('0 of 1 ticked');
    } finally {
      await lists.deleteListIfPresent(listId);
    }
  });

  test('carries unticked items into a new list when marking done', async ({ page }) => {
    const lists = new ShoppingListsPage(page);
    await lists.goto();
    const listId = await lists.createList();
    let carriedId = '';

    const bought = sparIngredients[0]!.name;
    const forgotten = hoferIngredient.name;

    try {
      await lists.addIngredient(bought);
      await lists.addIngredient(forgotten);
      await lists.tick(bought);

      // Three ways out, not two — the middle one is why this isn't a plain confirm dialog.
      const dialog = await lists.openMarkDoneDialog();
      await expect(dialog).toContainText('1 item is still unticked');
      await expect(dialog.getByRole('button', { name: 'Move to a new list' })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Finish anyway' })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();

      await dialog.getByRole('button', { name: 'Move to a new list' }).click();
      await expect(dialog).toBeHidden();

      // It lands on the new list, holding the forgotten item under its own shop's heading — and
      // nothing that was already in the basket.
      await page.waitForURL((url) => !url.pathname.endsWith(listId));
      carriedId = lists.listIdFromUrl();
      await expect(lists.item(forgotten)).toBeVisible();
      await expect(lists.itemsUnder(HOFER.name)).toHaveCount(1);
      await expect(lists.item(bought)).toBeHidden();

      // The finished list is out of the way until you ask for it.
      await expect(lists.listLink(listId)).toHaveCount(0);
      await lists.showCompleted(true);
      await expect(lists.listLink(listId)).toBeVisible();
    } finally {
      await lists.deleteListIfPresent(listId);
      if (carriedId) {
        await lists.deleteListIfPresent(carriedId);
      }
    }
  });

  test('finishes a fully ticked list without asking anything', async ({ page }) => {
    const lists = new ShoppingListsPage(page);
    await lists.goto();
    const listId = await lists.createList();

    const name = sparIngredients[0]!.name;

    try {
      await lists.addIngredient(name);
      await lists.tick(name);

      // Nothing is left to decide, so there's no dialog to answer.
      await lists.markDone();
      await expect(page.getByRole('dialog')).toBeHidden();
      await expect(page.getByText('Done').first()).toBeVisible();
    } finally {
      await lists.deleteListIfPresent(listId);
    }
  });

  test('drops a section once its last item is gone', async ({ page }) => {
    const lists = new ShoppingListsPage(page);
    await lists.goto();
    const listId = await lists.createList();

    const first = sparIngredients[0]!.name;
    const second = sparIngredients[1]!.name;

    try {
      await lists.addIngredient(first);
      await lists.addIngredient(second);
      await expect(lists.section(SPAR.name)).toBeVisible();

      // Still one item left, so the heading stays.
      await lists.removeItem(first);
      await expect(lists.section(SPAR.name)).toBeVisible();

      // The heading exists to group things; with nothing under it, it goes too.
      await lists.removeItem(second);
      await expect(lists.section(SPAR.name)).toBeHidden();
    } finally {
      await lists.deleteListIfPresent(listId);
    }
  });

  // Deleting the open list is covered in `serial-seed-mutations.spec.ts` instead: reproducing the
  // bug needs the deleted list to be the one the index would auto-select, which is only certain when
  // the household holds no others — and this project runs several list-making specs at once.

  test('keeps a section’s items when the section is removed', async ({ page }) => {
    const lists = new ShoppingListsPage(page);
    await lists.goto();
    const listId = await lists.createList();

    const custom = `E2E Aisle ${Date.now()}`;
    const oneOff = `E2E Odd ${Date.now()}`;

    try {
      await lists.addSection(custom);
      await lists.addOneOff(oneOff);
      await expect(lists.section(custom)).toBeVisible();

      // Removing a heading must not take its items with it — they fall back to ungrouped.
      await page.getByRole('button', { name: 'Section actions' }).click();
      await page.getByRole('menuitem', { name: 'Remove section' }).click();
      await expect(lists.section(custom)).toBeHidden();
      await expect(lists.item(oneOff)).toBeVisible();
    } finally {
      await lists.deleteListIfPresent(listId);
    }
  });

  test('shows one pane at a time on a phone', async ({ page }) => {
    const lists = new ShoppingListsPage(page);

    // Under the `md` breakpoint the two columns can't sit side by side.
    await page.setViewportSize({ height: 800, width: 390 });
    await lists.goto();

    // Nothing is auto-selected: doing so would hide the list of lists the moment you arrived.
    await expect(page).toHaveURL(/\/food\/shopping-lists(\?|$)/);
    await expect(lists.masterColumn()).toBeVisible();

    const listId = await lists.createList();

    try {
      // With a list open the master column steps aside, and the way back is explicit.
      await expect(lists.masterColumn()).toBeHidden();
      await expect(lists.backToAllLists()).toBeVisible();

      await lists.backToAllLists().click();
      await expect(lists.masterColumn()).toBeVisible();

      // Desktop is the opposite: arriving with no selection opens a list for you.
      await page.setViewportSize({ height: 900, width: 1280 });
      await lists.goto();
      await expect(page).toHaveURL(/\/food\/shopping-lists\/\d+/);
      await expect(lists.masterColumn()).toBeVisible();
    } finally {
      await page.setViewportSize({ height: 900, width: 1280 });
      await lists.deleteListIfPresent(listId);
    }
  });
});

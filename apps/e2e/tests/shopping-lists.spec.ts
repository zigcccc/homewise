import { expect, type Page, test } from '@playwright/test';

import {
  SEED_CHILD_MEMBER,
  SEED_INGREDIENTS,
  SEED_RECIPE,
  SEED_STORES,
  SEED_USER,
} from '@homewise/server/seed-fixtures';

import { IngredientsPage } from '../pages/ingredients.page';
import { ShoppingListsPage } from '../pages/shopping-lists.page';
import { API_URL } from '../playwright.config';

/** The seeded recipe's id, which nothing hard-codes — looked up so a reseed can't strand the spec. */
async function recipeIdByTitle(page: Page, title: string) {
  const response = await page.context().request.get(`${API_URL}/recipes`, { params: { search: title } });
  expect(response.ok()).toBe(true);

  const [recipe] = (await response.json()).filter((row: { title: string }) => row.title === title);
  expect(recipe, `seeded recipe "${title}" not found`).toBeTruthy();

  return recipe.id as number;
}

/**
 * Seeded members, by the name they're displayed under. Looked up rather than hard-coded for the
 * usual reason, and needed at all so a planted meal can name exactly who's eating it — see the
 * import spec, where "everyone" would be whatever other specs have left on the roster.
 */
async function memberIdsByName(page: Page, names: string[]) {
  const response = await page.context().request.get(`${API_URL}/households/my`);
  expect(response.ok()).toBe(true);

  const members: { displayName: string; id: number }[] = (await response.json()).members;

  return names.map((name) => {
    const member = members.find((row) => row.displayName === name);
    expect(member, `seeded member "${name}" not found`).toBeTruthy();

    return member!.id;
  });
}

/** An item's id, which the UI never renders — needed to act on a row as another member would. */
async function itemIdByLabel(page: Page, listId: string, label: string) {
  const response = await page.context().request.get(`${API_URL}/shopping-lists/${listId}`);
  expect(response.ok()).toBe(true);

  const item = (await response.json()).items.find((row: { label: string }) => row.label === label);
  expect(item, `item "${label}" not found on list ${listId}`).toBeTruthy();

  return item.id as number;
}

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

  test('refuses to put the same ingredient on a list twice', async ({ page }) => {
    const lists = new ShoppingListsPage(page);
    await lists.goto();
    const listId = await lists.createList();

    const name = sparIngredients[0]!.name;

    try {
      await lists.addIngredient(name);
      await expect(lists.itemsUnder(SPAR.name)).toHaveCount(1);

      // Shown, so you can see it's already handled — but not selectable, so the rule reads as a
      // greyed-out row rather than an error after the click.
      await lists.openAddPicker();
      const option = page.getByRole('option').filter({ has: page.getByText(name, { exact: true }) });
      await expect(option).toContainText('Already added');
      await expect(option).toBeDisabled();
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

      // "Show completed" is off, so a completed list is simply gone — out of the column and out of
      // the detail pane. Leaving it on screen would make the filter a lie.
      await expect(page).not.toHaveURL(new RegExp(`/food/shopping-lists/${listId}$`));
      await expect(lists.listLink(listId)).toHaveCount(0);

      // Not reachable by direct link either, while the filter is off. Asserted as "not this list"
      // rather than "the bare index": the redirect lands on the index, which then auto-selects
      // whichever list is first — another spec's, in parallel.
      await page.goto(`/food/shopping-lists/${listId}`);
      await expect(page).not.toHaveURL(new RegExp(`/food/shopping-lists/${listId}(\\?|$)`));

      // Turning the filter on brings it back, marked done.
      await lists.goto();
      await lists.showCompleted(true);
      await expect(lists.listLink(listId)).toContainText('Done');

      // And clicking it opens it. The filter is the only thing making a completed list reachable, so
      // it has to survive the navigation the column's own links make: dropped, the detail loader sees
      // the filter off and redirects straight back out, and the list is unclickable in the one view
      // that shows it.
      await lists.listLink(listId).click();
      await expect(page).toHaveURL(new RegExp(`/food/shopping-lists/${listId}\\?includeCompleted=true`));
      await expect(page.getByRole('button', { name: 'List actions' })).toBeVisible();
    } finally {
      await lists.deleteListIfPresent(listId);
    }
  });

  test('puts a removed item back exactly, slot and amount included', async ({ page }) => {
    const lists = new ShoppingListsPage(page);
    await lists.goto();
    const listId = await lists.createList();

    const first = sparIngredients[0]!.name;
    const second = sparIngredients[1]!.name;

    try {
      await lists.addIngredient(first);
      await lists.addIngredient(second);

      // Everything a removal has to carry back: an amount, a note, and having been in the basket.
      await lists.editItem(first, { note: 'the big tub', quantity: 2, unit: 'kg' });
      await lists.tick(first);

      await lists.removeItem(first);
      await lists.undoRemoval(first);

      // Back at the top, not appended below the row that outlived it — the whole reason this is an
      // Undo rather than a confirm dialog is that it restores what was lost, position included.
      await expect(lists.itemsUnder(SPAR.name).first()).toContainText(first);
      await expect(lists.item(first)).toContainText('2 kg');
      await expect(lists.item(first)).toContainText('the big tub');
      await expect(lists.isTicked(first)).toHaveCount(1);

      // The last row under a heading takes the heading with it, so the removed row's section id is
      // dead by the time Undo fires. Restoring it has to mint the heading back rather than 404.
      await lists.removeItem(second);
      await lists.removeItem(first);
      await expect(lists.section(SPAR.name)).toBeHidden();

      await lists.undoRemoval(first);
      await expect(lists.section(SPAR.name)).toBeVisible();
      await expect(lists.itemsUnder(SPAR.name)).toHaveCount(1);
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

  test('edits an item’s amount and note in place', async ({ page }) => {
    const lists = new ShoppingListsPage(page);
    await lists.goto();
    const listId = await lists.createList();

    const name = sparIngredients[0]!.name;
    const note = `E2E Note ${Date.now()}`;

    try {
      await lists.addIngredient(name);

      // How much, in what unit, and why — three values that only mean anything together, which is
      // why they commit as one save rather than a field at a time.
      await lists.editItem(name, { note, quantity: 2, unit: 'kg' });
      await expect(lists.item(name)).toContainText('2 kg');
      await expect(lists.item(name)).toContainText(note);

      // Reopening reseeds from what was written, not from the draft that was open before — and this
      // time through the *name*, which opens the editor for an ingredient exactly as it does for a
      // one-off. The open editor has to keep saying which row you're in.
      await lists.openItemEditorByName(name);
      await expect(lists.quantityField()).toHaveValue('2');
      await expect(page.getByRole('listitem').filter({ has: lists.quantityField() })).toContainText(name);
    } finally {
      await lists.deleteListIfPresent(listId);
    }
  });

  test('moves an item under a different heading', async ({ page }) => {
    const lists = new ShoppingListsPage(page);
    await lists.goto();
    const listId = await lists.createList();

    const name = sparIngredients[0]!.name;

    try {
      await lists.addIngredient(name);
      await lists.addIngredient(hoferIngredient.name);
      await expect(lists.itemsUnder(SPAR.name)).toHaveCount(1);

      // Auto-placement is a default, not a verdict — you buy this one at the other shop this week.
      await lists.moveItem(name, HOFER.name);
      await expect(lists.itemsUnder(HOFER.name)).toHaveCount(2);

      // And the shop it left has nothing under it any more, so the heading goes too.
      await expect(lists.section(SPAR.name)).toBeHidden();

      await lists.moveItem(name, 'No section');
      await expect(lists.ungroupedItems()).toHaveCount(1);
      await expect(lists.itemsUnder(HOFER.name)).toHaveCount(1);
    } finally {
      await lists.deleteListIfPresent(listId);
    }
  });

  test('drags an item to another shop', async ({ page }) => {
    const lists = new ShoppingListsPage(page);
    await lists.goto();
    const listId = await lists.createList();

    const sparOnly = sparIngredients[0]!.name;

    try {
      await lists.addIngredient(sparOnly);
      await lists.addIngredient(hoferIngredient.name);

      // One drag, deliberately: every extra one is another chance for a parallel spec's realtime
      // event to land mid-drag. This one carries the weight — the row files itself under the other
      // heading, and the shop it emptied goes with it.
      await lists.dragItem(sparOnly, lists.sectionList(HOFER.name));
      await expect(lists.itemsUnder(HOFER.name)).toHaveCount(2);
      await expect(lists.section(SPAR.name)).toBeHidden();

      // Re-read, so this is what the server stored and not what dnd-kit drew.
      await lists.openList(listId);
      await expect(lists.itemsUnder(HOFER.name)).toHaveCount(2);
    } finally {
      await lists.deleteListIfPresent(listId);
    }
  });

  test('reorders an item within its own section', async ({ page }) => {
    const lists = new ShoppingListsPage(page);
    await lists.goto();
    const listId = await lists.createList();

    const first = sparIngredients[0]!.name;
    const second = sparIngredients[1]!.name;

    try {
      await lists.addIngredient(first);
      await lists.addIngredient(second);
      await expect(lists.itemsUnder(SPAR.name).first()).toContainText(first);

      // A `position` with no section change — the branch a menu move never reaches. Driven through
      // the API rather than a drag onto the neighbouring row: that is barely a row's travel, the
      // least reliable pointer path there is, and the drag itself has its own spec above.
      const moved = await itemIdByLabel(page, listId, second);
      const response = await page
        .context()
        .request.patch(`${API_URL}/shopping-lists/${listId}/items/${moved}`, { data: { position: 0 } });
      expect(response.ok()).toBe(true);

      // Re-read, so this is the order the server stored rather than one the client imagined.
      await lists.openList(listId);
      await expect(lists.itemsUnder(SPAR.name).first()).toContainText(second);
    } finally {
      await lists.deleteListIfPresent(listId);
    }
  });

  test('keeps an open item editor on its own row when the list shifts underneath it', async ({ page }) => {
    const lists = new ShoppingListsPage(page);
    await lists.goto();
    const listId = await lists.createList();

    const stamp = Date.now();
    // Both ungrouped, so they sit in one bucket in insertion order and removing the first shifts
    // the second up exactly one place.
    const above = `E2E Above ${stamp}`;
    const mine = `E2E Mine ${stamp}`;
    const note = `E2E Note ${stamp}`;

    try {
      await lists.addOneOff(above);
      await lists.addOneOff(mine);
      await expect(lists.ungroupedItems()).toHaveCount(2);

      await lists.openItemEditor(mine);
      await page.getByRole('textbox', { name: 'Note' }).fill(note);

      // Another member removes the row above this one. Realtime refetches the list under the open
      // editor, so everything below the removed row moves up a place.
      const removed = await itemIdByLabel(page, listId, above);
      const response = await page.context().request.delete(`${API_URL}/shopping-lists/${listId}/items/${removed}`);
      expect(response.ok()).toBe(true);
      await expect(lists.ungroupedItems()).toHaveCount(1);

      // Asserted mid-edit, before the save: keyed by position rather than by id, the row that was
      // being edited is gone and the editor belongs to whichever item took the old index — so it
      // either commits onto a row nobody opened or vanishes with the typing in it. Waiting for the
      // save to fail proves the same thing, but only after a 45s timeout and with a worse message.
      await expect(page.getByRole('textbox', { name: 'Note' })).toHaveValue(note);

      await lists.saveItemEdit();
      await expect(lists.item(mine)).toContainText(note);
    } finally {
      await lists.deleteListIfPresent(listId);
    }
  });

  /**
   * This spec's own far-future days, planted through the API rather than relying on the seeded plan:
   * the seed puts its recipe on the *current* ISO Monday, which the import's default range only
   * covers on some days of the week. Its own days also keep it clear of the other specs.
   *
   * Every planting **names who's eating**, and that is load-bearing rather than incidental: a meal
   * that names nobody is for everyone, and `household-members.spec.ts`, `kids.spec.ts` and
   * `meal-plan.spec.ts` all add and remove members while this runs. Left to the headcount, the scale
   * factor would wobble between runs and this spec would fail for reasons that have nothing to do
   * with importing.
   */
  test('builds a list from the recipes planned in a range, scaled to who is eating', async ({ page }) => {
    const lists = new ShoppingListsPage(page);
    const from = '2098-03-02';
    const to = '2098-03-08';
    const mealIds: number[] = [];
    let listId = '';

    const seededRecipeId = await recipeIdByTitle(page, SEED_RECIPE.title);

    const plant = async (day: string, memberIds: number[]) => {
      const response = await page
        .context()
        .request.post(`${API_URL}/meal-plan/meals`, { data: { day, memberIds, recipeId: seededRecipeId } });
      expect(response.ok()).toBe(true);
      mealIds.push((await response.json()).id);
    };

    // The seeded recipe on two days of the range, so the amounts have something to add up — and for
    // different numbers of people, so each planting has to be scaled on its own rather than the pair
    // sharing one factor. It serves 4: one eater takes a quarter of it, two take a half.
    const [adult, child] = await memberIdsByName(page, [SEED_USER.name, SEED_CHILD_MEMBER.nickname]);
    const secondDay = '2098-03-04';
    await plant(from, [adult!]);
    await plant(secondDay, [adult!, child!]);

    const garlic = SEED_RECIPE.ingredients[0]!;
    const asWritten = garlic.quantity * 2;
    const scaled = garlic.quantity / SEED_RECIPE.servings + (garlic.quantity * 2) / SEED_RECIPE.servings;

    try {
      await lists.gotoImport({ from, to });

      // Buying for 3 of the 8 servings the two plantings make, not for all 8.
      await expect(lists.previewRow(garlic.name)).toContainText(`${scaled} ${garlic.unit}`);
      // Named once, though it was planned twice — and saying where the number came from.
      await expect(lists.previewRow(garlic.name)).toContainText(`${SEED_RECIPE.title} (3 of 8)`);

      // Cooking ahead: the recipes as written, all 8 servings of them.
      await lists.toggleScaling(false);
      await expect(lists.previewRow(garlic.name)).toContainText(`${asWritten} ${garlic.unit}`);
      await expect(lists.previewRow(garlic.name)).not.toContainText('(3 of 8)');

      await lists.toggleScaling(true);
      await expect(lists.previewRow(garlic.name)).toContainText(`${scaled} ${garlic.unit}`);

      // Untick the one already in the cupboard, then move the range off the first planting. What's on
      // screen has to *be* what gets imported, and the range is what decides it: the rows are loader
      // data while the ticks are form state, so the form has to be reseeded rather than left holding
      // the previous range's lines. An abandoned tick coming back is the visible half of that.
      await lists.excludeFromImport(SEED_RECIPE.ingredients[3]!.name);
      await lists.setImportRange('from', secondDay);
      await expect(
        page.getByRole('checkbox', { checked: true, name: `Include ${SEED_RECIPE.ingredients[3]!.name}` })
      ).toBeVisible();

      // One planting left, for two people: half of what it makes rather than three quarters.
      const halved = (garlic.quantity * 2) / SEED_RECIPE.servings;
      await expect(lists.previewRow(garlic.name)).toContainText(`${halved} ${garlic.unit}`);
      await expect(lists.previewRow(garlic.name)).toContainText(`${SEED_RECIPE.title} (2 of 4)`);

      await lists.excludeFromImport(SEED_RECIPE.ingredients[3]!.name);
      await lists.confirmImport();
      listId = lists.listIdFromUrl();

      // The rest landed, filed under the shops their ingredients belong to — carrying the amount that
      // was on screen, not the one the recipes are written for.
      await expect(lists.item(garlic.name)).toContainText(`${halved} ${garlic.unit}`);
      await expect(lists.itemsUnder(SPAR.name)).toHaveCount(1);
      await expect(lists.item(SEED_RECIPE.ingredients[3]!.name)).toHaveCount(0);
    } finally {
      for (const mealId of mealIds) {
        await page.context().request.delete(`${API_URL}/meal-plan/meals/${mealId}`);
      }
      if (listId) {
        await lists.deleteListIfPresent(listId);
      }
    }
  });

  test('tells an empty range apart from one whose meals have no recipe', async ({ page }) => {
    const lists = new ShoppingListsPage(page);
    const range = { from: '2098-07-06', to: '2098-07-12' } as const;

    // A stretch of 2098 nothing is planned on. The fix is to go and plan something.
    await lists.gotoImport(range);
    await expect(page.getByText('Nothing planned for these days')).toBeVisible();

    const response = await page
      .context()
      .request.post(`${API_URL}/meal-plan/meals`, { data: { day: '2098-07-08', title: `E2E Takeaway ${Date.now()}` } });
    expect(response.ok()).toBe(true);
    const mealId = (await response.json()).id;

    try {
      // Now something *is* planned, and it still yields nothing — a free-text meal names no
      // ingredients. Different cause, different fix, so it must not read the same.
      await lists.gotoImport(range);
      await expect(page.getByText('Nothing to buy for these days')).toBeVisible();
      await expect(page.getByText('no recipe attached')).toBeVisible();
    } finally {
      await page.context().request.delete(`${API_URL}/meal-plan/meals/${mealId}`);
    }
  });

  // "The open list is deleted by someone else" lives in `serial-seed-mutations.spec.ts`: it needs a
  // known number of lists in the household — with none left the layout drops the detail pane
  // altogether and shows the empty state, which was never the bug — and this project has several
  // specs minting and removing lists at once.

  test('shows one pane at a time on a phone', async ({ page }) => {
    const lists = new ShoppingListsPage(page);

    // Under the `md` breakpoint the two columns can't sit side by side.
    await page.setViewportSize({ height: 800, width: 390 });
    await lists.goto();

    // Its own list first, before anything asserts on the master column: with no lists at all the
    // layout drops the two panes for a full-width empty state, and this project has other specs
    // creating and deleting lists in the same household at the same time.
    const listId = await lists.createList();

    try {
      // With a list open the master column steps aside, and the way back is explicit.
      await expect(lists.masterColumn()).toBeHidden();
      await expect(lists.backToAllLists()).toBeVisible();

      await lists.backToAllLists().click();
      await expect(lists.masterColumn()).toBeVisible();

      // Nothing is auto-selected: doing so would hide the list of lists the moment you arrived.
      await lists.goto();
      await expect(page).toHaveURL(/\/food\/shopping-lists(\?|$)/);
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

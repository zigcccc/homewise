import { expect, test } from '@playwright/test';

import { SEED_INGREDIENTS } from '@homewise/server/seed-fixtures';

import { IngredientsPage } from '../pages/ingredients.page';
import { MealPlanPage } from '../pages/meal-plan.page';
import { ShoppingListsPage } from '../pages/shopping-lists.page';
import { SECOND_USER_STORAGE_STATE } from '../support/paths';

/** This spec's own far-future week — see the note in `meal-plan.spec.ts`. */
const REALTIME_WEEK = '2099-05-04';

test.describe('realtime', () => {
  /**
   * The whole point of the pub/sub layer: a member who is already looking at a list sees someone
   * else's change without touching the page. The observer never reloads or navigates after it opens
   * the library, so nothing but a delivered event can make these assertions pass.
   *
   * The ingredient library is the cheapest surface that exercises the full path — create and delete
   * are both one dialog, and both emit.
   */
  test('shows another member’s changes on an open page, without a reload', async ({ page, browser }) => {
    const name = `E2E Realtime ${Date.now()}`;

    // The observer: SEED_USER, parked on the library.
    const observer = new IngredientsPage(page);
    await observer.goto();
    await expect(observer.row(name)).toHaveCount(0);

    // The actor: SEED_SECOND_USER — a different account, a different browser context, the same
    // household. Two tabs of one user would work too, but this proves the cross-account case.
    const actorContext = await browser.newContext({ storageState: SECOND_USER_STORAGE_STATE });
    const actor = new IngredientsPage(await actorContext.newPage());

    try {
      await actor.goto();

      await actor.add(name);
      await expect(observer.row(name)).toBeVisible();

      await actor.delete(name);
      await expect(observer.row(name)).toHaveCount(0);
    } finally {
      try {
        await actor.goto();
        await actor.deleteIfPresent(name);
      } finally {
        await actorContext.close();
      }
    }
  });

  /**
   * The meal plan is the surface where this matters most: two people plan the week together, often
   * on two devices at the same table. The observer never reloads.
   */
  test('shows a meal another member plans, without a reload', async ({ page, browser }) => {
    test.slow();
    const lunch = `E2E Realtime Lunch ${Date.now()}`;

    const observer = new MealPlanPage(page);
    await observer.goto(REALTIME_WEEK);
    await expect(observer.meal(REALTIME_WEEK, lunch)).toHaveCount(0);

    const actorContext = await browser.newContext({ storageState: SECOND_USER_STORAGE_STATE });
    const actor = new MealPlanPage(await actorContext.newPage());

    try {
      await actor.goto(REALTIME_WEEK);

      await actor.addFreeTextMeal(REALTIME_WEEK, lunch);
      await expect(observer.meal(REALTIME_WEEK, lunch)).toBeVisible();

      await actor.removeMeal(REALTIME_WEEK, lunch);
      await expect(observer.meal(REALTIME_WEEK, lunch)).toHaveCount(0);
    } finally {
      await actorContext.close();
    }
  });

  /**
   * Two people in the same shop, splitting the aisles. One ticks the milk off, the other's phone has
   * to show it — otherwise they both buy milk, which is the exact failure a shared list exists to
   * prevent. The observer never reloads after opening the list.
   */
  test('shows an item another member ticks off, without a reload', async ({ page, browser }) => {
    test.slow();
    const item = SEED_INGREDIENTS[0]!.name;

    const observer = new ShoppingListsPage(page);
    await observer.goto();
    const listId = await observer.createList();
    await observer.addIngredient(item);
    await expect(observer.progress()).toHaveText('0 of 1 ticked');

    const actorContext = await browser.newContext({ storageState: SECOND_USER_STORAGE_STATE });
    const actor = new ShoppingListsPage(await actorContext.newPage());

    try {
      await actor.openList(listId);
      await actor.tick(item);

      // The observer hasn't touched its page — only a delivered event can move this counter.
      await expect(observer.progress()).toHaveText('1 of 1 ticked');
      await expect(observer.isTicked(item)).toBeVisible();
    } finally {
      await actorContext.close();
      await observer.deleteListIfPresent(listId);
    }
  });
});

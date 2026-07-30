import { expect, test } from '@playwright/test';

import { IngredientsPage } from '../pages/ingredients.page';
import { SECOND_USER_STORAGE_STATE } from '../support/paths';

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
});

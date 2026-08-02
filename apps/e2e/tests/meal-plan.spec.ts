import { expect, test } from '@playwright/test';

import { SEED_CHILD_MEMBER, SEED_RECIPE, SEED_SECOND_USER, SEED_USER } from '@homewise/server/seed-fixtures';

import { HouseholdMembersPage } from '../pages/household-members.page';
import { MealPlanPage } from '../pages/meal-plan.page';
import { API_URL } from '../playwright.config';
import { SECOND_USER_STORAGE_STATE } from '../support/paths';
import { removeManagedMember } from '../support/profiles';

/**
 * Each test owns a distinct far-future Monday, reached straight through the URL.
 *
 * That's the whole isolation strategy: the `parallel` project is `fullyParallel` against one shared
 * seeded household, so two specs planning meals on "next Tuesday" would collide. A week in 2099 is
 * one no other spec and no human will ever open, which makes these idempotent across reruns without
 * any date arithmetic in the suite. The seeded household stays read-only here — `SEED_RECIPE` and
 * `SEED_CHILD_MEMBER` are asserted against, never mutated.
 */
const WEEKS = {
  plan: { monday: '2099-01-05', tuesday: '2099-01-06', wednesday: '2099-01-07' },
  menuMove: { monday: '2099-02-02', tuesday: '2099-02-03' },
  drag: { monday: '2099-03-02', wednesday: '2099-03-04' },
  nav: { monday: '2099-04-06' },
  undo: { monday: '2099-06-01' },
  identity: { monday: '2099-07-06' },
  coverage: { monday: '2099-08-03' },
  roles: { monday: '2099-09-07' },
} as const;

test.describe('meal plan', () => {
  test('plans a week inline — recipe, custom entry, members and notes', async ({ page }) => {
    test.slow();
    const mealPlan = new MealPlanPage(page);
    const { monday, tuesday, wednesday } = WEEKS.plan;
    const lunch = `E2E Lunch ${Date.now()}`;

    await mealPlan.goto(monday);

    try {
      // Picking a recipe is the whole interaction — it creates the meal with everyone eating it.
      await mealPlan.addRecipeMeal(monday, SEED_RECIPE.title);
      await expect(mealPlan.meal(monday, SEED_RECIPE.title)).toContainText('Everyone');

      await mealPlan.addFreeTextMeal(tuesday, lunch);
      await expect(mealPlan.meal(tuesday, lunch)).toContainText('Everyone');

      await mealPlan.assignMeal(tuesday, lunch, [SEED_CHILD_MEMBER.nickname]);
      await expect(mealPlan.meal(tuesday, lunch)).toContainText(SEED_CHILD_MEMBER.nickname);
      await expect(mealPlan.meal(tuesday, lunch)).not.toContainText('Everyone');

      await mealPlan.setMealNote(tuesday, lunch, 'Double batch');
      await expect(mealPlan.meal(tuesday, lunch)).toContainText('Double batch');

      await mealPlan.setDayNote(wednesday, 'Picnic — 8 adults, 2 children');
      await expect(mealPlan.dayRow(wednesday)).toContainText('Picnic — 8 adults, 2 children');

      // Reload: proves every inline edit reached the database rather than just the cache.
      await mealPlan.goto(monday);
      await expect(mealPlan.meal(monday, SEED_RECIPE.title)).toBeVisible();
      await expect(mealPlan.meal(tuesday, lunch)).toContainText(SEED_CHILD_MEMBER.nickname);
      await expect(mealPlan.meal(tuesday, lunch)).toContainText('Double batch');
      await expect(mealPlan.dayRow(wednesday)).toContainText('Picnic — 8 adults, 2 children');
    } finally {
      await mealPlan.removeMealIfPresent(monday, SEED_RECIPE.title);
      await mealPlan.removeMealIfPresent(tuesday, lunch);
      await mealPlan.clearDayNote(wednesday);
    }
  });

  test('abandons an empty custom entry instead of creating one', async ({ page }) => {
    const mealPlan = new MealPlanPage(page);
    const { wednesday } = WEEKS.plan;

    await mealPlan.goto(WEEKS.plan.monday);

    // A meal needs a label, so an entry opened and left empty must write nothing at all. Blurring
    // one nobody typed into has to close it *silently* — it used to flag the field invalid, which
    // is a complaint about a value the user never entered.
    await mealPlan.openCustomEntry(wednesday);
    await expect(mealPlan.customEntry(wednesday)).not.toHaveAttribute('aria-invalid', 'true');
    await mealPlan.dayRow(wednesday).getByRole('heading').click();

    await expect(mealPlan.customEntry(wednesday)).toBeHidden();
    await expect(mealPlan.dayRow(wednesday).getByRole('listitem')).toHaveCount(0);

    // Escape works, but nothing on screen says so — Cancel is the visible way out, and it has to win
    // the race against the blur its own click causes.
    await mealPlan.openCustomEntry(wednesday);
    await mealPlan.customEntry(wednesday).fill('Typed then thought better of it');
    await mealPlan.cancelCustomEntry(wednesday);

    await expect(mealPlan.customEntry(wednesday)).toBeHidden();
    await expect(mealPlan.dayRow(wednesday).getByRole('listitem')).toHaveCount(0);
  });

  test('folds the add actions away once everyone has a meal', async ({ page }) => {
    const mealPlan = new MealPlanPage(page);
    const { monday } = WEEKS.coverage;
    const lunch = `E2E Coverage ${Date.now()}`;

    await mealPlan.goto(monday);

    try {
      // A new meal feeds everyone, so the day is planned the moment it exists.
      await mealPlan.addFreeTextMeal(monday, lunch);
      await expect(mealPlan.coverageHint(monday)).toBeHidden();
      await expect(mealPlan.pickRecipeButton(monday)).toBeHidden();
      await expect(mealPlan.addAnotherButton(monday)).toBeVisible();

      // Narrow it to the child and the two adults are suddenly unfed — which is the state the whole
      // hint exists to surface, since the day still *looks* planned.
      await mealPlan.assignMeal(monday, lunch, [SEED_CHILD_MEMBER.nickname]);

      await expect(mealPlan.coverageHint(monday)).toContainText(SEED_USER.name);
      await expect(mealPlan.coverageHint(monday)).toContainText(SEED_SECOND_USER.name);
      await expect(mealPlan.coverageHint(monday)).not.toContainText(SEED_CHILD_MEMBER.nickname);
      await expect(mealPlan.pickRecipeButton(monday)).toBeVisible();
    } finally {
      await mealPlan.removeMealIfPresent(monday, lunch);
    }
  });

  test('offers only adults and kids a meal — not pets or external members', async ({ page }) => {
    const mealPlan = new MealPlanPage(page);
    const { monday } = WEEKS.roles;
    const stamp = Date.now();
    const lunch = `E2E Roles ${stamp}`;
    const pet = `E2E Roles Pet ${stamp}`;
    const external = `E2E Roles External ${stamp}`;

    // Both are household members like any other; neither eats lunch off the plan. The seed has no
    // pet and no external member, so without creating them this spec would assert nothing. Nothing
    // else in the suite minds them existing — and because they're ineligible, they can't move the
    // coverage spec's count either.
    const members = new HouseholdMembersPage(page);
    await members.goto();
    await members.addManagedMemberWithRole(pet, 'Pet');
    await members.addManagedMemberWithRole(external, 'External');

    try {
      await mealPlan.goto(monday);
      await mealPlan.addFreeTextMeal(monday, lunch);

      const names = await mealPlan.assignableMemberNames(monday, lunch);

      expect(names).not.toContain(pet);
      expect(names).not.toContain(external);
      expect(names).toEqual(expect.arrayContaining([SEED_USER.name, SEED_CHILD_MEMBER.nickname]));
    } finally {
      await mealPlan.removeMealIfPresent(monday, lunch);
      await removeManagedMember(page, pet);
      await removeManagedMember(page, external);
    }
  });

  test('removes a meal and puts it back with Undo', async ({ page }) => {
    const mealPlan = new MealPlanPage(page);
    const { monday } = WEEKS.undo;
    const lunch = `E2E Undo ${Date.now()}`;

    await mealPlan.goto(monday);

    try {
      await mealPlan.addFreeTextMeal(monday, lunch);
      await mealPlan.assignMeal(monday, lunch, [SEED_CHILD_MEMBER.nickname]);

      await mealPlan.removeMeal(monday, lunch);
      await mealPlan.undoRemove();

      // Undo restores the meal as it was, assignment included — not just its name.
      await expect(mealPlan.meal(monday, lunch)).toBeVisible();
      await expect(mealPlan.meal(monday, lunch)).toContainText(SEED_CHILD_MEMBER.nickname);
    } finally {
      await mealPlan.removeMealIfPresent(monday, lunch);
    }
  });

  test('keeps an open inline edit on its own meal when the day fills underneath it', async ({ browser, page }) => {
    const mealPlan = new MealPlanPage(page);
    const { monday } = WEEKS.identity;
    const stamp = Date.now();
    const mine = `E2E Identity ${stamp} b`;
    const renamed = `E2E Renamed ${stamp}`;
    const neighbour = `E2E Identity ${stamp} a`;

    await mealPlan.goto(monday);

    try {
      await mealPlan.addFreeTextMeal(monday, mine);
      await mealPlan.openLabelEditor(monday, mine);
      await mealPlan.labelEditor(monday, mine).fill(renamed);

      // Another member adds a meal to the same day, at position 0. Realtime refetches the list under
      // the open editor and everything below shifts down a place.
      //
      // Genuinely a second account, not this tab's own request context. The acting tab is identified
      // by `x-homewise-client-id` and skips its own events, so posting as the same user would only
      // work because `APIRequestContext` happens not to send that header — an invisible dependency
      // that would turn into an unexplained timeout the day anything sets `extraHTTPHeaders`.
      const actorContext = await browser.newContext({ storageState: SECOND_USER_STORAGE_STATE });

      try {
        const response = await actorContext.request.post(`${API_URL}/meal-plan/meals`, {
          data: { day: monday, position: 0, title: neighbour },
        });
        expect(response.ok()).toBe(true);
      } finally {
        await actorContext.close();
      }
      await expect(mealPlan.meal(monday, neighbour)).toBeVisible();

      await mealPlan.labelEditor(monday, mine).press('Enter');

      // The rename has to follow the meal it was opened on. Keyed by position, the editor would have
      // moved onto whichever meal took the old index — renaming one the user never touched.
      await expect(mealPlan.meal(monday, renamed)).toBeVisible();
      await expect(mealPlan.meal(monday, neighbour)).toBeVisible();
      await expect(mealPlan.meal(monday, mine)).toHaveCount(0);
    } finally {
      await mealPlan.goto(monday);
      await mealPlan.removeMealIfPresent(monday, renamed);
      await mealPlan.removeMealIfPresent(monday, mine);
      await mealPlan.removeMealIfPresent(monday, neighbour);
    }
  });

  test('moves a meal to another day from the menu', async ({ page }) => {
    const mealPlan = new MealPlanPage(page);
    const { monday, tuesday } = WEEKS.menuMove;
    const lunch = `E2E Move ${Date.now()}`;

    await mealPlan.goto(monday);

    try {
      await mealPlan.addFreeTextMeal(monday, lunch);

      await mealPlan.moveMealToDay(monday, lunch, 'Tuesday');

      // Both halves matter: a move that copies would leave Monday populated.
      await expect(mealPlan.meal(tuesday, lunch)).toBeVisible();
      await expect(mealPlan.dayRow(monday).getByRole('listitem')).toHaveCount(0);
    } finally {
      await mealPlan.removeMealIfPresent(tuesday, lunch);
      await mealPlan.removeMealIfPresent(monday, lunch);
    }
  });

  test('moves a meal to another day by dragging it', async ({ page }) => {
    test.slow();
    const mealPlan = new MealPlanPage(page);
    const { monday, wednesday } = WEEKS.drag;
    const lunch = `E2E Drag ${Date.now()}`;

    await mealPlan.goto(monday);

    try {
      await mealPlan.addFreeTextMeal(monday, lunch);

      await mealPlan.dragMeal(monday, lunch, wednesday);

      await expect(mealPlan.meal(wednesday, lunch)).toBeVisible();
      await expect(mealPlan.dayRow(monday).getByRole('listitem')).toHaveCount(0);

      // Reload: the drag path is entirely separate code from the menu path, so this is the only
      // thing proving the move actually reached the server rather than just the optimistic cache.
      await mealPlan.goto(monday);
      await expect(mealPlan.meal(wednesday, lunch)).toBeVisible();
    } finally {
      await mealPlan.removeMealIfPresent(wednesday, lunch);
      await mealPlan.removeMealIfPresent(monday, lunch);
    }
  });

  test('pages through weeks and widens the range', async ({ page }) => {
    const mealPlan = new MealPlanPage(page);
    await mealPlan.goto(WEEKS.nav.monday);

    await expect(mealPlan.dayCards()).toHaveCount(7);

    // Wait for the *cards* after each step, not just the URL.
    //
    // The router flips the URL as part of the navigation, but the week links only recompute their
    // targets on the next React render. `toHaveURL` passes inside that window, so clicking straight
    // after it follows the previous week's href and lands two weeks out — which is how this spec
    // failed intermittently under load. A rendered card for the new week proves the same commit that
    // updates the links has landed.
    await mealPlan.nextWeeks();
    await expect(page).toHaveURL(/from=2099-04-13/);
    await expect(mealPlan.dayRow('2099-04-13')).toBeVisible();

    await mealPlan.previousWeeks();
    await expect(page).toHaveURL(/from=2099-04-06/);
    await expect(mealPlan.dayRow('2099-04-06')).toBeVisible();

    await mealPlan.setWeeksShown(2);
    await expect(mealPlan.dayCards()).toHaveCount(14);

    // Back to the current week. Only the marker is asserted — never any meal data, since this is the
    // one week that carries the seed and whatever a real person has planned.
    //
    // Scoped to the day cards, because the *link* that got us here is also called "Today" and renders
    // on every week. Unscoped, this matched the link and passed without the view moving at all — and
    // once the cards rendered it matched both and died of a strict-mode violation instead.
    await mealPlan.goToToday();
    await expect(mealPlan.dayCards().getByText('Today', { exact: true })).toBeVisible();
  });
});

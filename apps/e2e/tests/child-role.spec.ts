import {
  SEED_CHILD_MEMBER,
  SEED_EXPENSES,
  SEED_INGREDIENTS,
  SEED_RECIPE,
  SEED_STORAGE_CONTACT,
  SEED_STORAGE_ITEMS,
  SEED_STORAGE_LOCATIONS,
  SEED_USER,
} from '@homewise/server/seed-fixtures';

import { AppNav } from '../pages/app-nav.page';
import { DashboardPage } from '../pages/dashboard.page';
import { HouseholdMembersPage } from '../pages/household-members.page';
import { expect, test } from '../support/test';

/**
 * A child reads the whole household and writes none of it.
 *
 * Driven as a sweep over the list routes rather than one spec per affordance: the risk this covers is
 * a *missed* control, and enumerating the ones we remembered to hide would miss exactly the same ones
 * the implementation did. Each row asserts the page really rendered before asserting what is absent,
 * so a broken route cannot pass as a well-gated one.
 */
const LIST_ROUTES = [
  { create: /^Add contact$/, path: '/family/contacts', shows: SEED_STORAGE_CONTACT.name },
  { create: /^Log an expense$|^Add expense$/, path: '/expenses/monthly-expenses', shows: SEED_EXPENSES[0].title },
  { create: /^Add location$/, path: '/storage/locations', shows: SEED_STORAGE_LOCATIONS[0].name },
  { create: /^Add item$/, path: '/storage/items', shows: SEED_STORAGE_ITEMS[0].name },
  { create: /^New recipe$/, path: '/food/recipes', shows: SEED_RECIPE.title },
  { create: /^Add ingredient$/, path: '/food/ingredients', shows: SEED_INGREDIENTS[0].name },
  { create: /^Add member$/, path: '/manage/household-members', shows: SEED_USER.name },
] as const;

test.describe('child member', () => {
  test.use({ sessionAs: 'child' });

  test('still lands on the dashboard', async ({ page }) => {
    await page.goto('/');

    await new DashboardPage(page).expectLoaded({ userName: 'Kid User' });
    // Every quick action starts a write, so the row goes rather than showing four dead buttons.
    await expect(page.getByRole('button', { name: 'Quick actions' })).toHaveCount(0);
  });

  test('keeps every section except the one that is nothing but writes', async ({ page }) => {
    await page.goto('/');
    const nav = new AppNav(page);

    for (const visible of ['Kids', 'Pets', 'Contacts', 'Recipes', 'Shopping lists', 'Household members']) {
      await expect(nav.navLink(visible)).toBeVisible();
    }

    // Rename, currency, transfer, delete — there is nothing on it to read.
    await expect(nav.navLink('Settings')).toHaveCount(0);
  });

  for (const { create, path, shows } of LIST_ROUTES) {
    test(`reads ${path} without a way to change it`, async ({ page }) => {
      await page.goto(path);

      // Real seeded content, not a heading — otherwise the absences below would pass on a blank page.
      await expect(page.getByText(shows).first()).toBeVisible();
      await expect(page.getByRole('button', { name: create })).toHaveCount(0);
      await expect(page.getByRole('link', { name: create })).toHaveCount(0);
    });
  }

  /**
   * The surfaces the sweep above can't reach, because their write chrome isn't a "create" button on a
   * list: a day card, a row menu, a second tab, a suggestion. Each was found by hand once already.
   */
  test('reads the meal plan without a way to fill a day', async ({ page }) => {
    await page.goto('/food/meal-plan');

    const day = page.locator('[data-testid^="meal-plan-day-"]').first();
    await expect(day).toBeVisible();

    await expect(page.getByRole('button', { name: /^Pick a recipe for/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Add a custom meal on/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Add a note for/ })).toHaveCount(0);
  });

  test('is offered no way to invite anybody', async ({ page }) => {
    const members = new HouseholdMembersPage(page);
    await page.goto('/manage/household-members');
    await expect(members.memberRow(SEED_CHILD_MEMBER.nickname)).toBeVisible();

    // A managed member without an account is the one row that offers to invite them into one.
    await members.memberRow(SEED_CHILD_MEMBER.nickname).getByRole('button', { name: 'Open menu' }).click();
    await expect(page.getByRole('menuitem', { name: 'Invite to create account' })).toHaveCount(0);
    await page.keyboard.press('Escape');

    await members.goToInvitesTab();
    await expect(page.getByRole('button', { name: 'Send an invite' })).toHaveCount(0);
  });

  test('is not shown a suggestion it could not act on', async ({ page }) => {
    await page.goto('/family/pets');

    await expect(page.getByRole('heading', { level: 1, name: 'Pets' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Suggestions' })).toHaveCount(0);
  });
});

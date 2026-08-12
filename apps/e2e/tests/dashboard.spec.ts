import { expect, test } from '@playwright/test';

import { SEED_EXPENSES, SEED_MEAL_PLAN, SEED_RECIPE } from '@homewise/server/seed-fixtures';

import { ContactsPage } from '../pages/contacts.page';
import { DashboardPage } from '../pages/dashboard.page';
import { ShoppingListsPage } from '../pages/shopping-lists.page';

/**
 * The dashboard reads six other domains and owns none of them, so what it can safely assert is
 * split in two.
 *
 * Anything the seed pins down — this week's meals, this month's expenses — is asserted directly:
 * the fixtures are week- and month-relative and every other spec deliberately works in far-future
 * windows, so those two cards are stable under parallel workers. Anything ranked against the whole
 * household — the newest list, the nearest birthday — is asserted on a row this spec creates itself,
 * because a card showing the top four of a shared table is a race with every other worker.
 *
 * **Kept deliberately few and cheap.** One dashboard load is ten API calls, and an earlier draft
 * that opened it nine times (five of them just to click a link and land on another list page) put
 * the whole suite over the edge — three runs, three unrelated specs timing out. Everything readable
 * from one page load is asserted from one page load, and the "does this link go there" checks read
 * `href` instead of navigating.
 */

/** The month's spend, excluding what was paid back. Formatted sl-SI, so the separator is a comma. */
const seededMonthTotal = SEED_EXPENSES.filter((expense) => !expense.paidBack)
  .reduce((sum, expense) => sum + expense.amount, 0)
  .toFixed(2)
  .replace('.', ',');

/** A birth date whose month and day are tomorrow's, backdated so it reads as a birthday. */
function birthdayTomorrow() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const day = String(tomorrow.getDate()).padStart(2, '0');
  const month = String(tomorrow.getMonth() + 1).padStart(2, '0');

  return `${day}. ${month}. ${tomorrow.getFullYear() - 30}`;
}

test.describe('dashboard', () => {
  test('shows every card, and what the seed put in each', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.weekMeals()).toBeVisible();
    await expect(dashboard.shoppingLists()).toBeVisible();
    await expect(dashboard.birthdays()).toBeVisible();
    await expect(dashboard.spending()).toBeVisible();
    await expect(dashboard.loans()).toBeVisible();
    await expect(dashboard.recentRecipes()).toBeVisible();

    // The seeded plan is offsets from this week's Monday, and every spec that writes a meal writes
    // it on a far-future week — so this week is exactly what the seed put there.
    await expect(dashboard.weekMeals()).toContainText(SEED_RECIPE.title);
    await expect(dashboard.weekMeals()).toContainText('At work');
    await expect(dashboard.weekMeals()).toContainText(SEED_MEAL_PLAN.notes[0].note);

    // The paid-back kettle stays off the total while its row keeps its place in the list below.
    await expect(dashboard.monthTotal()).toContainText(seededMonthTotal);
    await expect(dashboard.spending()).toContainText('Parking');
    await expect(dashboard.spending()).toContainText('Returned kettle');

    // "There is an overdue row", not a named item: the card shows the four nearest loans out of a
    // table every worker lends from, so which rows land is not this spec's to decide. The seed
    // guarantees at least one overdue item exists at all times.
    await expect(dashboard.loans().getByText('Overdue').first()).toBeVisible();
  });

  test('points each card at the page that owns it', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    // Asserted on the href rather than by clicking through: the wiring is the thing under test, and
    // five navigations to five list pages cost the suite far more than they prove.
    await expect(dashboard.weekMeals().getByRole('link', { name: 'Plan the week' })).toHaveAttribute(
      'href',
      '/food/meal-plan'
    );
    await expect(dashboard.shoppingLists().getByRole('link', { name: 'View all' })).toHaveAttribute(
      'href',
      '/food/shopping-lists'
    );
    await expect(dashboard.spending().getByRole('link', { name: 'View all' })).toHaveAttribute(
      'href',
      '/expenses/monthly-expenses'
    );
    await expect(dashboard.recentRecipes().getByRole('link', { name: 'View all' })).toHaveAttribute(
      'href',
      '/food/recipes'
    );
    await expect(dashboard.loans().getByRole('link', { name: 'View all' })).toHaveAttribute(
      'href',
      '/storage/items?loanStatus=onLoan'
    );
  });

  test('shows a newly created shopping list', async ({ page }) => {
    const lists = new ShoppingListsPage(page);
    const dashboard = new DashboardPage(page);
    const listId = await lists.createList();

    try {
      await dashboard.goto();

      // By href rather than by label: a list with no sections is labelled from its sections, so
      // several workers' lists read identically. Newest first, so a list made a moment ago is top.
      await expect(dashboard.shoppingLists().locator(`a[href="/food/shopping-lists/${listId}"]`)).toBeVisible();
    } finally {
      // Through the API, not the UI: a list left behind here surfaces as a failure in the exclusive
      // project, which needs the household to hold no lists at all.
      await lists.deleteListViaApi(listId);
    }
  });

  test('counts down to a birthday tomorrow', async ({ page }) => {
    const contacts = new ContactsPage(page);
    const dashboard = new DashboardPage(page);
    const name = `E2E Birthday ${Date.now()}`;

    try {
      await contacts.goto();
      await contacts.add(name, { birthday: birthdayTomorrow(), type: 'Friend' });

      await dashboard.goto();

      // Tomorrow is the nearest a birthday can be short of today, so this survives whatever other
      // workers are adding. Containment rather than first place, for the same reason.
      await expect(dashboard.birthdays()).toContainText(name);
      await expect(dashboard.birthdays()).toContainText('Tomorrow');
    } finally {
      await contacts.goto();
      await contacts.deleteIfPresent(name);
    }
  });
});

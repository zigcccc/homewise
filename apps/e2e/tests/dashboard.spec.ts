import { SEED_EXPENSES, SEED_MEAL_PLAN, SEED_RECIPE } from '@homewise/server/seed-fixtures';

import { ContactsPage } from '../pages/contacts.page';
import { DashboardPage } from '../pages/dashboard.page';
import { HouseholdMembersPage } from '../pages/household-members.page';
import { KidsPage } from '../pages/kids.page';
import { ShoppingListsPage } from '../pages/shopping-lists.page';
import { expect, test } from '../support/test';

/**
 * The dashboard owns none of its data, so it asserts on what the seed pins down (this week's meals,
 * this month's expenses) and otherwise on rows this spec creates itself — a card showing the top
 * four of a shared table is a race with every other worker.
 *
 * Kept few and cheap: one load is ten API calls, and an earlier draft that opened the page nine
 * times took unrelated specs over their timeout.
 */

/** Formatted sl-SI, so the separator is a comma. */
const asAmount = (value: number) => `${value.toFixed(2).replace('.', ',')} €`;

/** The month's spend, less what was paid back. */
const seededMonthTotal = asAmount(
  SEED_EXPENSES.filter((expense) => !expense.paidBack).reduce((sum, expense) => sum + expense.amount, 0)
);

/** The one seeded expense that was paid back, whose row is struck through. */
const paidBackAmount = asAmount(SEED_EXPENSES.find((expense) => expense.paidBack)?.amount ?? 0);

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
    await expect(dashboard.familyProfiles()).toBeVisible();
    await expect(dashboard.activity()).toBeVisible();

    // Every spec that writes a meal writes it on a far-future week, so this week is the seed's.
    await expect(dashboard.weekMeals()).toContainText(SEED_RECIPE.title);
    await expect(dashboard.weekMeals()).toContainText('At work');
    await expect(dashboard.weekMeals()).toContainText(SEED_MEAL_PLAN.notes[0].note);

    // The paid-back kettle stays off the total, but keeps its row in the list below — struck
    // through, with the total saying what it left out, or the rows read as more than the sum.
    await expect(dashboard.monthTotal()).toContainText(seededMonthTotal);
    await expect(dashboard.spending()).toContainText('Parking');
    await expect(dashboard.spending()).toContainText('Returned kettle');
    await expect(dashboard.spending()).toContainText('paid back');
    await expect(dashboard.spending().getByText(paidBackAmount, { exact: true })).toHaveClass(/line-through/);

    // "An overdue row exists", not a named item: the loans specs lend from this same table.
    await expect(dashboard.loans().getByText('Overdue').first()).toBeVisible();
  });

  test('points each card at the page that owns it', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    // On the href, not by clicking: the wiring is what's under test, and five navigations aren't free.
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
    // The one card holding two lists, so it points at both rather than picking a favourite.
    await expect(dashboard.familyProfiles().getByRole('link', { name: 'Kids' })).toHaveAttribute(
      'href',
      '/family/kids'
    );
    await expect(dashboard.familyProfiles().getByRole('link', { name: 'Pets' })).toHaveAttribute(
      'href',
      '/family/pets'
    );
  });

  test('opens the expense dialog over the dashboard', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    const dialog = await dashboard.openExpenseDialog();

    // The category picker is the part that fetches, behind the dialog's own suspense boundary.
    await expect(dialog.getByRole('button', { name: 'Category' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dashboard.weekMeals()).toBeVisible();
  });

  test('shows a newly created shopping list', async ({ page }) => {
    const lists = new ShoppingListsPage(page);
    const dashboard = new DashboardPage(page);
    const listId = await lists.createList();

    try {
      await dashboard.goto();

      // By href: a list is labelled from its sections, so several workers' lists read identically.
      await expect(dashboard.shoppingLists().locator(`a[href="/food/shopping-lists/${listId}"]`)).toBeVisible();
    } finally {
      // Through the API: a list left behind fails the exclusive project, not this spec.
      await lists.deleteListViaApi(listId);
    }
  });

  test('shows a newly created kid profile', async ({ page }) => {
    const members = new HouseholdMembersPage(page);
    const kids = new KidsPage(page);
    const dashboard = new DashboardPage(page);
    const name = `E2E Profile ${Date.now()}`;

    await members.goto();
    await members.addManagedMember(name); // defaults to the Child role

    try {
      await kids.goto();
      await kids.createProfileFor(name);

      await dashboard.goto();

      // The tile, not the card: every profile this worker has made lands in this one card.
      const tile = dashboard.familyProfiles().getByRole('link').filter({ hasText: name });

      await expect(tile).toBeVisible();
      // The two lines under the name — the second is the per-kind one, which pets spell differently.
      await expect(tile).toContainText('Age not set');
      await expect(tile).toContainText('0 words in the dictionary');
    } finally {
      // Removing the member cascade-deletes the profile it was created for.
      await members.goto();
      await members.removeMember(name);
      await expect(members.memberRow(name)).toBeHidden();
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

      // Containment, not first place: the contacts specs put birthdays on this household too.
      await expect(dashboard.birthdays()).toContainText(name);
      await expect(dashboard.birthdays()).toContainText('Tomorrow');
    } finally {
      await contacts.goto();
      await contacts.deleteIfPresent(name);
    }
  });
});

/**
 * One load, deliberately — the note above applies here too, and this only needs the header. The
 * viewport is a phone's, which is what puts `useIsMobile` on the mobile branch; both projects
 * otherwise run Desktop Chrome, so every other dashboard test still exercises the four-button row.
 */
test.describe('quick actions on a phone', () => {
  test.use({ viewport: { height: 844, width: 390 } });

  test('collapse behind a bottom sheet that closes when an action is taken', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    // The bug this replaced: four buttons in a `w-fit` group made the page scroll sideways. Measured
    // on the app's own scrollport, not on `documentElement` — `SidebarInset` is `overflow-hidden`,
    // so the document never overflows and the assertion would pass with the bug still in place.
    const overflows = await page.evaluate(() => {
      const scrollport = document.querySelector('[data-scroll-restoration-id="app-content"]');

      if (!scrollport) {
        throw new Error('No app scrollport — the layout moved and this assertion measures nothing.');
      }

      return scrollport.scrollWidth > scrollport.clientWidth;
    });
    expect(overflows).toBe(false);

    // `Expense` is the quick action rendered as a button; the two that navigate are links.
    await expect(page.getByRole('button', { exact: true, name: 'Expense' })).toBeHidden();

    const sheet = await dashboard.openQuickActions();
    await expect(sheet.getByRole('link', { name: 'Plan a meal' })).toBeVisible();

    await sheet.getByRole('button', { exact: true, name: 'Contact' }).click();

    // Taking an action closes the sheet and leaves its dialog open behind it.
    await expect(sheet).toBeHidden();
    const dialog = page.getByRole('dialog', { name: 'Create contact' });
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});

import { expect, test } from '@playwright/test';

import { MonthlyExpensesPage } from '../pages/monthly-expenses.page';
import { API_URL } from '../playwright.config';

/**
 * Every spec works in a **far-future month of its own**.
 *
 * The usual defence in this suite — a uniquely-named row — isn't enough here, because the header
 * total and the category breakdown are aggregates over the whole month. Two workers logging into the
 * same month would each see the other's rows in their total. `SEED_EXPENSES` lives in the current
 * month and is only ever read.
 */
const YEAR = new Date().getFullYear() + 5;

test.describe('monthly expenses', () => {
  test('adds an expense, totals it, edits it in place and deletes it', async ({ page }) => {
    const expenses = new MonthlyExpensesPage(page);
    const title = `E2E Expense ${Date.now()}`;
    const renamed = `${title} renamed`;

    await expenses.goto(1, YEAR);

    try {
      await expect(expenses.total()).toBeHidden();

      await expenses.add({ amount: '42,50', title });
      await expect(expenses.row(title)).toBeVisible();
      await expect(expenses.row(title)).toContainText('42,50');
      // The month had nothing in it, so the total is this expense and nothing else.
      await expect(expenses.total()).toContainText('42,50');

      await expenses.editInline(title, 'Title', renamed);
      await expect(expenses.row(renamed)).toBeVisible();

      await expenses.editInline(renamed, 'Amount', '10');
      await expect(expenses.row(renamed)).toContainText('10,00');
      await expect(expenses.total()).toContainText('10,00');
    } finally {
      await expenses.deleteIfPresent(renamed);
      await expenses.deleteIfPresent(title);
    }

    await expect(expenses.row(renamed)).toBeHidden();
  });

  test('marks an expense paid back, which keeps the row but drops it from the total', async ({ page }) => {
    const expenses = new MonthlyExpensesPage(page);
    const kept = `E2E Kept ${Date.now()}`;
    const returned = `E2E Returned ${Date.now()}`;

    await expenses.goto(2, YEAR);

    try {
      await expenses.add({ amount: '20', title: kept });
      await expenses.add({ amount: '30', title: returned });
      await expect(expenses.total()).toContainText('50,00');

      await expenses.togglePaidBack(returned);

      // Still listed, badged, and no longer counted — that's the whole point of the flag.
      await expect(expenses.row(returned)).toBeVisible();
      await expect(expenses.row(returned)).toContainText('Paid back');
      await expect(expenses.total()).toContainText('20,00');
      await expect(expenses.total()).toContainText('30,00 € paid back');

      await expenses.togglePaidBack(returned);
      await expect(expenses.row(returned)).not.toContainText('Paid back');
      await expect(expenses.total()).toContainText('50,00');
    } finally {
      await expenses.deleteIfPresent(kept);
      await expenses.deleteIfPresent(returned);
    }
  });

  test('keeps each month to itself', async ({ page }) => {
    const expenses = new MonthlyExpensesPage(page);
    const title = `E2E March ${Date.now()}`;

    await expenses.goto(3, YEAR);

    try {
      await expenses.add({ amount: '15', title });
      await expect(expenses.row(title)).toBeVisible();

      await expenses.selectMonth(4);
      await expect(expenses.row(title)).toBeHidden();
      await expect(page).toHaveURL(/month=4/);

      await expenses.selectMonth(3);
      await expect(expenses.row(title)).toBeVisible();
    } finally {
      await expenses.deleteIfPresent(title);
    }
  });

  test('searches within the month', async ({ page }) => {
    const expenses = new MonthlyExpensesPage(page);
    const stamp = Date.now();
    const wanted = `E2E Findme ${stamp}`;
    const other = `E2E Other ${stamp}`;

    await expenses.goto(5, YEAR);

    try {
      await expenses.add({ amount: '11', title: wanted });
      await expenses.add({ amount: '12', title: other });

      await expenses.search('Findme');
      await expect(expenses.row(wanted)).toBeVisible();
      await expect(expenses.row(other)).toBeHidden();

      // The total describes the month, not the filtered rows, so it doesn't move as you type.
      await expect(expenses.total()).toContainText('23,00');

      await expenses.search('');
      await expect(expenses.row(other)).toBeVisible();
    } finally {
      await expenses.deleteIfPresent(wanted);
      await expenses.deleteIfPresent(other);
    }
  });

  test('creates a category from the picker and files the expense under it', async ({ page }) => {
    const expenses = new MonthlyExpensesPage(page);
    const stamp = Date.now();
    const title = `E2E Categorised ${stamp}`;
    const category = `E2E Cat ${stamp}`;

    await expenses.goto(6, YEAR);

    try {
      // The category doesn't exist yet — it's found-or-created by the same write that saves the
      // expense, so abandoning the dialog would have left nothing behind.
      await expenses.add({ amount: '25', category, title });

      await expect(expenses.row(title)).toContainText(category);
      await expect(expenses.breakdownChip(category)).toBeVisible();
      await expect(expenses.breakdownChip(category)).toContainText('25,00');
    } finally {
      await expenses.deleteIfPresent(title);
      await expenses.deleteCategoryIfPresent(category, 6, YEAR);
    }
  });

  test('filters the month by a category from the breakdown', async ({ page }) => {
    const expenses = new MonthlyExpensesPage(page);
    const stamp = Date.now();
    const inCategory = `E2E Filed ${stamp}`;
    const uncategorised = `E2E Loose ${stamp}`;
    const category = `E2E Filter ${stamp}`;

    await expenses.goto(7, YEAR);

    try {
      await expenses.add({ amount: '40', category, title: inCategory });
      await expenses.add({ amount: '5', title: uncategorised });

      await expenses.breakdownChip(category).click();
      await expect(expenses.row(inCategory)).toBeVisible();
      await expect(expenses.row(uncategorised)).toBeHidden();
      // The breakdown still lists every slice while one is selected — otherwise you couldn't switch.
      await expect(expenses.breakdownChip('Uncategorised')).toBeVisible();

      await page.getByRole('button', { name: 'Clear filter' }).click();
      await expect(expenses.row(uncategorised)).toBeVisible();
    } finally {
      await expenses.deleteIfPresent(inCategory);
      await expenses.deleteIfPresent(uncategorised);
      await expenses.deleteCategoryIfPresent(category, 7, YEAR);
    }
  });

  test('manages categories in a sheet the URL drives', async ({ page }) => {
    const expenses = new MonthlyExpensesPage(page);
    const stamp = Date.now();
    const title = `E2E Sheet ${stamp}`;
    const category = `E2E Managed ${stamp}`;
    const renamed = `${category} renamed`;

    await expenses.goto(8, YEAR);

    try {
      await expenses.add({ amount: '9', title });
      // A search term, so closing the sheet has something more than the month to preserve.
      await expenses.search(title);

      await expenses.openCategoriesFromRow(title);
      await expect(page).toHaveURL(/\/expenses\/monthly-expenses\/categories/);
      // The month and the filters survive the trip — the whole reason for `retainSearchParams`.
      await expect(page).toHaveURL(/month=8/);
      await expect(page).toHaveURL(new RegExp(`year=${YEAR}`));
      await expect(page).toHaveURL(/search=/);
      // The table never unmounted; it's still there behind the panel.
      await expect(expenses.rowBehindSheet(title)).toBeVisible();

      await expenses.addCategory(category);
      await expenses.renameCategory(category, renamed);
      await expect(expenses.sheet().getByText(renamed, { exact: true })).toBeVisible();

      await expenses.closeSheet();
      await expect(page).toHaveURL(/month=8/);
      await expect(page).not.toHaveURL(/categories/);

      // The payoff of putting the panel in the URL: history moves through it.
      await page.goBack();
      await expect(expenses.sheet()).toBeVisible();
      await page.goForward();
      await expect(expenses.sheet()).toBeHidden();

      // And it's reachable cold, with the page rendered behind it.
      await page.goto(`/expenses/monthly-expenses/categories?month=8&year=${YEAR}`);
      await expect(expenses.sheet()).toBeVisible();
      await expect(expenses.rowBehindSheet(title)).toBeVisible();
    } finally {
      await expenses.deleteCategoryIfPresent(renamed, 8, YEAR);
      await expenses.deleteCategoryIfPresent(category, 8, YEAR);
      await expenses.closeSheet();
      await expenses.deleteIfPresent(title);
    }
  });

  test('deleting a category leaves its expenses, uncategorised', async ({ page }) => {
    const expenses = new MonthlyExpensesPage(page);
    const stamp = Date.now();
    const title = `E2E Orphan ${stamp}`;
    const category = `E2E Doomed ${stamp}`;

    await expenses.goto(9, YEAR);

    try {
      await expenses.add({ amount: '18', category, title });
      await expect(expenses.row(title)).toContainText(category);

      await expenses.openCategoriesFromRow(title);
      await expenses.deleteCategory(category);
      await expenses.closeSheet();

      // The expense survives its category — the FK is `set null`, not a cascade.
      await expect(expenses.row(title)).toBeVisible();
      await expect(expenses.row(title)).not.toContainText(category);
      await expect(expenses.total()).toContainText('18,00');
    } finally {
      await expenses.deleteIfPresent(title);
    }
  });

  test('keeps an open inline rename on its own row when the list shifts underneath it', async ({ page }) => {
    const expenses = new MonthlyExpensesPage(page);
    const stamp = Date.now();
    const mine = `E2E Mine ${stamp}`;
    const renamed = `E2E Mine ${stamp} renamed`;
    const neighbour = `E2E Neighbour ${stamp}`;

    await expenses.goto(10, YEAR);

    try {
      await expenses.add({ amount: '7', title: mine });
      await expenses.openInlineTitleEdit(mine);

      // Another member logs an expense dated later, which sorts above this one. Realtime refetches
      // the list under the open editor, so every row below the new one moves down a place.
      const response = await page.context().request.post(`${API_URL}/expenses`, {
        data: { amount: 3, recordedAt: `${YEAR}-10-28`, title: neighbour },
      });
      expect(response.ok()).toBe(true);
      await expect(expenses.row(neighbour)).toBeVisible();

      await expenses.commitInlineTitleEdit(renamed);

      // The edit has to land on the row it was opened on, not on whichever took that position.
      await expect(expenses.row(renamed)).toBeVisible();
      await expect(expenses.row(neighbour)).toBeVisible();
      await expect(expenses.row(neighbour)).not.toContainText('renamed');
    } finally {
      await expenses.deleteIfPresent(renamed);
      await expenses.deleteIfPresent(mine);
      await expenses.deleteIfPresent(neighbour);
    }
  });
});

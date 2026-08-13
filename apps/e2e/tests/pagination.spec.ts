import { expect, type Page, test } from '@playwright/test';

import { SEED_INGREDIENTS } from '@homewise/server/seed-fixtures';

import { IngredientsPage } from '../pages/ingredients.page';
import { Pagination } from '../pages/pagination';

/**
 * Pagination, driven on the ingredients table — every paginated list shares one bar and one pair of
 * search params, so proving it here proves it everywhere.
 *
 * `pageSize=3` throughout, against the seeded library. The picker's smallest option is 10 and the
 * seed holds fewer rows than that, so a page size only the URL can ask for is what makes several
 * pages exist without seeding a hundred ingredients or mutating a fixture other specs read.
 *
 * Nothing here asserts a *total*: specs run in parallel against one household, so another spec's
 * ingredient can arrive mid-run. Only the seeded floor is relied on — enough rows for three pages.
 */
const PAGE_SIZE = 3;
const url = (params = '') => `/food/ingredients?pageSize=${PAGE_SIZE}${params}`;

/**
 * The ingredient names on screen, in order. Read off the name cell's own control rather than the
 * whole `<tr>`: a row's text is every cell run together, which compares badly and says nothing about
 * which rows these are.
 */
const rowNames = (page: Page) => page.getByRole('button', { name: 'Edit name' }).allInnerTexts();

test.describe('pagination', () => {
  test('pages through a table, and keeps the page in the URL', async ({ page }) => {
    const pagination = new Pagination(page);
    await page.goto(url());
    await expect(page.getByRole('heading', { level: 1, name: 'Ingredients' })).toBeVisible();

    const rows = page.getByRole('row');
    // One header row on top of the page's worth.
    await expect(rows).toHaveCount(PAGE_SIZE + 1);
    await expect(pagination.range()).toHaveText(`1–${PAGE_SIZE} of ${await totalFrom(pagination)}`);

    // There is nowhere back from the first page.
    await expect(pagination.button('Previous page')).toBeDisabled();
    await expect(pagination.button('First page')).toBeDisabled();
    await pagination.expectOnPage(1);

    const firstPage = await rowNames(page);

    await pagination.next(2);
    await expect(page).toHaveURL(/[?&]page=2(?:&|$)/);
    await pagination.expectOnPage(2);

    // The rows have to actually change, and share nothing with the page before them — a pager that
    // renumbers itself over the same rows, or one whose ordering lets a row sit on two pages, is
    // exactly what this is here to catch.
    const secondPage = await rowNames(page);
    expect(secondPage).not.toEqual(firstPage);
    expect(secondPage.filter((name) => firstPage.includes(name))).toEqual([]);

    await expect(pagination.button('Previous page')).toBeEnabled();

    await pagination.previous(1);
    expect(await rowNames(page)).toEqual(firstPage);
  });

  test('jumps straight to a numbered page, and stops at the last one', async ({ page }) => {
    const pagination = new Pagination(page);
    await page.goto(url());

    // The point of numbering the pages: page three without visiting page two. The seeded library is
    // comfortably more than two pages of three, so the button is always there to click.
    await pagination.goToPage(3);
    await expect(page).toHaveURL(/[?&]page=3(?:&|$)/);
    await pagination.expectOnPage(3);

    // Back to the first, so "last" is a jump rather than a click on a button already disabled —
    // three pages of three is the *whole* list on a quiet run.
    await pagination.first();
    await pagination.last(Math.ceil((await totalFrom(pagination)) / PAGE_SIZE));

    await expect(pagination.button('Next page')).toBeDisabled();
    await expect(pagination.button('Last page')).toBeDisabled();

    await pagination.first();
    await expect(pagination.button('Previous page')).toBeDisabled();
  });

  test('returns to the first page when the rows per page change', async ({ page }) => {
    const pagination = new Pagination(page);
    await page.goto(url('&page=3'));
    await pagination.expectOnPage(3);

    await pagination.setRowsPerPage(10);

    // Staying on page 3 of a list that now has one page would render an empty table.
    await expect(page).toHaveURL(/[?&]page=1(?:&|$)/);
    await pagination.expectOnPage(1);
  });

  test('returns to the first page when the list is searched', async ({ page }) => {
    const ingredients = new IngredientsPage(page);
    const pagination = new Pagination(page);

    await page.goto(url('&page=3'));
    await pagination.expectOnPage(3);

    await ingredients.search(SEED_INGREDIENTS[0].name);

    await expect(page).toHaveURL(/[?&]page=1(?:&|$)/);
    await expect(ingredients.row(SEED_INGREDIENTS[0].name)).toBeVisible();
  });

  test('keeps the bar in reach on a screen the list overflows', async ({ page }) => {
    const pagination = new Pagination(page);

    // Short enough that a full page of rows runs off the bottom — the case where the controls for
    // turning the page were themselves only reachable by scrolling past every row.
    await page.setViewportSize({ height: 400, width: 1280 });
    await page.goto('/food/ingredients?pageSize=10');
    await expect(page.getByRole('heading', { level: 1, name: 'Ingredients' })).toBeVisible();

    // The premise: the list really does overflow, so the assertion below isn't passing for free.
    await expect(page.getByRole('row').last()).not.toBeInViewport();

    await expect(pagination.range()).toBeInViewport();
    await expect(pagination.button('Next page')).toBeInViewport();
  });

  test('shows the last page that exists when the URL asks for one past the end', async ({ page }) => {
    const pagination = new Pagination(page);

    // A hand-edited URL here; the reachable version is deleting the rows out from under a reader on
    // the last page, which leaves their tab asking for a page that no longer exists.
    await page.goto(url('&page=999'));

    const lastPage = Math.ceil((await totalFrom(pagination)) / PAGE_SIZE);
    await pagination.expectOnPage(lastPage);
    await expect(page.getByRole('row')).not.toHaveCount(1);
  });
});

/** Reads the total off the bar, so no assertion has to hard-code a count other specs can move. */
async function totalFrom(pagination: Pagination) {
  const label = await pagination.range().innerText();
  const total = label.split(' of ').at(-1);

  return Number(total);
}

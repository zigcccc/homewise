import { SEED_INGREDIENTS } from '@homewise/server/seed-fixtures';

import { IngredientsPage } from '../pages/ingredients.page';
import { Pagination } from '../pages/pagination';
import { expect, type Page, test } from '../support/test';

/**
 * Every paginated list shares one bar and one pair of search params, so the ingredients table
 * stands in for all of them.
 *
 * `pageSize=3` is below the picker's smallest option on purpose: it makes three pages out of the
 * seed. Nothing asserts a total: the ingredient library is this worker's, but the specs that write
 * to it run before and after these, so the count is theirs to move.
 */
const PAGE_SIZE = 3;
const url = (params = '') => `/food/ingredients?pageSize=${PAGE_SIZE}${params}`;

/** Row identity by name cell, not by `<tr>` text, which is every cell run together. */
const rowNames = (page: Page) => page.getByRole('button', { name: 'Edit name' }).allInnerTexts();

test.describe('pagination', () => {
  test('pages through a table, and keeps the page in the URL', async ({ page }) => {
    const pagination = new Pagination(page);
    await page.goto(url());
    await expect(page.getByRole('heading', { level: 1, name: 'Ingredients' })).toBeVisible();

    const rows = page.getByRole('row');
    await expect(rows).toHaveCount(PAGE_SIZE + 1);
    await expect(pagination.range()).toHaveText(`1–${PAGE_SIZE} of ${await totalFrom(pagination)}`);

    await expect(pagination.button('Previous page')).toBeDisabled();
    await expect(pagination.button('First page')).toBeDisabled();
    await pagination.expectOnPage(1);

    const firstPage = await rowNames(page);

    await pagination.next(2);
    await expect(page).toHaveURL(/[?&]page=2(?:&|$)/);
    await pagination.expectOnPage(2);

    // A pager that renumbers itself over the same rows is the failure to catch.
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

    // Page three without visiting page two.
    await pagination.goToPage(3);
    await expect(page).toHaveURL(/[?&]page=3(?:&|$)/);
    await pagination.expectOnPage(3);

    // Back to the first, or "last" may already be disabled: three pages is the whole list.
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

    // Page 3 of a list that now has one page would render empty.
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

    // Short enough that a full page runs off the bottom.
    await page.setViewportSize({ height: 400, width: 1280 });
    await page.goto('/food/ingredients?pageSize=10');
    await expect(page.getByRole('heading', { level: 1, name: 'Ingredients' })).toBeVisible();

    // The premise, or the assertion below passes for free.
    await expect(page.getByRole('row').last()).not.toBeInViewport();

    await expect(pagination.range()).toBeInViewport();
    await expect(pagination.button('Next page')).toBeInViewport();
  });

  test('shows the last page that exists when the URL asks for one past the end', async ({ page }) => {
    const pagination = new Pagination(page);

    // Reachable by deleting the last page's rows under a reader; faster to ask for it directly.
    await page.goto(url('&page=999'));

    const lastPage = Math.ceil((await totalFrom(pagination)) / PAGE_SIZE);
    await pagination.expectOnPage(lastPage);
    await expect(page.getByRole('row')).not.toHaveCount(1);
  });
});

/** Off the bar, so nothing hard-codes a count an earlier test on this worker can have moved. */
async function totalFrom(pagination: Pagination) {
  const label = await pagination.range().innerText();
  const total = label.split(' of ').at(-1);

  return Number(total);
}

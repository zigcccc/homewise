import { randomUUID } from 'node:crypto';

import { expect, type Page, test } from '@playwright/test';

import { MAX_PAGE_SIZE } from '@homewise/server/models';

import { IngredientsPage } from '../pages/ingredients.page';
import { API_URL } from '../playwright.config';

/** One page's worth, mirroring `OPTIONS_PAGE_SIZE`. */
const PAGE_SIZE = 25;

/** Enough to need a second page, with the last row far from the first. */
const FIXTURE_SIZE = 30;

/** Fixed width: cleanup searches by substring, so a shorter prefix would eat another test's rows. */
const uniquePrefix = () => `PickerFix ${randomUUID().slice(0, 8)}`;

const shopName = (prefix: string, index: number) => `${prefix} ${String(index).padStart(2, '0')}`;

/** The shop picker's result group, so the standing "None" row isn't counted as a result. */
const SHOPS = 'Your shops';

async function createShops(page: Page, prefix: string) {
  for (let index = 1; index <= FIXTURE_SIZE; index += 1) {
    const response = await page
      .context()
      .request.post(`${API_URL}/stores`, { data: { name: shopName(prefix, index) } });
    expect(response.ok(), `could not create "${shopName(prefix, index)}"`).toBe(true);
  }
}

/** Best-effort, and silent: this runs from `finally`, where a throw would replace the real failure. */
async function deleteShops(page: Page, prefix: string) {
  const list = await page
    .context()
    .request.get(`${API_URL}/stores?search=${encodeURIComponent(prefix)}&pageSize=${MAX_PAGE_SIZE}`);

  if (!list.ok()) {
    return;
  }

  const { items } = (await list.json()) as { items: { id: number }[] };

  for (const shop of items) {
    await page.context().request.delete(`${API_URL}/stores/${shop.id}`);
  }
}

test.describe('entity pickers', () => {
  // The seed holds two shops, far too few to page, so each test builds its own prefixed fixture.

  test('pages a long list as it is scrolled, and searches the whole of it', async ({ page }) => {
    const prefix = uniquePrefix();
    const ingredients = new IngredientsPage(page);

    try {
      await createShops(page, prefix);
      await ingredients.goto();

      const picker = await ingredients.openStorePickerInAddDialog(`E2E Ingredient ${Date.now()}`);
      await picker.search(prefix);

      // One page, not the lot: the whole point is that the picker no longer asks for everything.
      await expect(picker.options(SHOPS)).toHaveCount(PAGE_SIZE);
      await expect(picker.option(shopName(prefix, FIXTURE_SIZE))).toBeHidden();

      await picker.scrollToBottom(SHOPS);

      await expect(picker.options(SHOPS)).toHaveCount(FIXTURE_SIZE);
      await expect(picker.option(shopName(prefix, FIXTURE_SIZE))).toBeVisible();
    } finally {
      await deleteShops(page, prefix);
    }
  });

  test('finds a row that is nowhere near the first page', async ({ page }) => {
    const prefix = uniquePrefix();
    const ingredients = new IngredientsPage(page);

    try {
      await createShops(page, prefix);
      await ingredients.goto();

      const picker = await ingredients.openStorePickerInAddDialog(`E2E Ingredient ${Date.now()}`);

      // The regression: search used to filter rows already fetched, so this one was unreachable.
      const last = shopName(prefix, FIXTURE_SIZE);
      await picker.search(last);

      await expect(picker.option(last)).toBeVisible();
      await picker.option(last).click();
    } finally {
      await deleteShops(page, prefix);
    }
  });

  test('loads the next page from the keyboard', async ({ page }) => {
    const prefix = uniquePrefix();
    const ingredients = new IngredientsPage(page);

    try {
      await createShops(page, prefix);
      await ingredients.goto();

      const picker = await ingredients.openStorePickerInAddDialog(`E2E Ingredient ${Date.now()}`);
      await picker.search(prefix);
      await expect(picker.options(SHOPS)).toHaveCount(PAGE_SIZE);

      // The observer only fires on a scroll, so without this button the rest is mouse-only.
      await picker.loadMoreButton().focus();
      await page.keyboard.press('Enter');

      await expect(picker.options(SHOPS)).toHaveCount(FIXTURE_SIZE);
    } finally {
      await deleteShops(page, prefix);
    }
  });

  test('does not offer to create a shop that already exists', async ({ page }) => {
    const prefix = uniquePrefix();
    const ingredients = new IngredientsPage(page);

    try {
      await createShops(page, prefix);
      await ingredients.goto();

      const picker = await ingredients.openStorePickerInAddDialog(`E2E Ingredient ${Date.now()}`);

      const existing = shopName(prefix, 1);
      await picker.search(existing);

      // Offering here would let a fast click send a create the server refuses with a 409.
      await expect(picker.option(existing)).toBeVisible();
      await expect(picker.createButton(existing)).toBeHidden();

      // A name that only extends an existing one is still a new shop, so that one is offered.
      const fresh = `${existing} Annex`;
      await picker.search(fresh);
      await expect(picker.createButton(fresh)).toBeVisible();
    } finally {
      await deleteShops(page, prefix);
    }
  });
});

import { beforeAll, describe, expect, it } from 'vitest';

import { db, schema } from '#db/core';
import { StoresService } from '#modules/stores/stores.service';
import { createHousehold } from '#tests/households';

/**
 * `readPagedList`, through the thinnest service that uses it. Needs more rows than the seed has,
 * which is what puts it out of E2E's reach.
 *
 * The `asc(id)` tiebreaker is deliberately not covered: Postgres orders tied rows consistently at
 * any size a test can build, so the test would pass without it too.
 */

const shopName = (index: number) => `Shop ${String(index).padStart(3, '0')}`;

const listPage = (householdId: number, page: number, pageSize: number) =>
  StoresService.list(householdId, { page, pageSize, search: undefined, sortDirection: 'asc', sortKey: 'name' });

/** Three pages of five, the last one partial. */
const TOTAL = 12;
const PAGE_SIZE = 5;

let householdId: number;

beforeAll(async () => {
  householdId = (await createHousehold('paged')).householdId;

  await db.insert(schema.store).values(
    Array.from({ length: TOTAL }, (_, index) => ({
      householdId,
      name: shopName(index),
    }))
  );
});

describe('readPagedList', () => {
  it('should return the first page and the total behind it', async () => {
    // WHEN: the first page is read
    const page = await listPage(householdId, 1, PAGE_SIZE);

    // THEN: it should hold a page's worth, and report how many there are to page through
    expect(page.items.map((shop) => shop.name)).toEqual([0, 1, 2, 3, 4].map(shopName));
    expect(page).toMatchObject({ page: 1, pageSize: PAGE_SIZE, total: TOTAL });
  });

  it('should not repeat or skip a row across a page boundary', async () => {
    // WHEN: every page is read in turn
    const pages = await Promise.all([1, 2, 3].map((page) => listPage(householdId, page, PAGE_SIZE)));
    const seen = pages.flatMap((page) => page.items.map((shop) => shop.name));

    // THEN: every row exactly once — none skipped between pages, none served twice
    expect(seen).toEqual(Array.from({ length: TOTAL }, (_, index) => shopName(index)));
    expect(new Set(seen).size).toBe(TOTAL);
  });

  it('should cut the last page short rather than padding it', async () => {
    // WHEN: the final page is read, and it doesn't divide evenly
    const page = await listPage(householdId, 3, PAGE_SIZE);

    // THEN: it should hold only the rows that are left
    expect(page.items).toHaveLength(TOTAL % PAGE_SIZE);
    expect(page.total).toBe(TOTAL);
  });

  it('should count only the rows that match the filter, not the whole table', async () => {
    // WHEN: a search narrows the list to one row
    const page = await StoresService.list(householdId, {
      page: 1,
      pageSize: PAGE_SIZE,
      search: shopName(7),
      sortDirection: 'asc',
      sortKey: 'name',
    });

    // THEN: the total describes the filtered list, or the pager offers pages that render empty
    expect(page.items.map((shop) => shop.name)).toEqual([shopName(7)]);
    expect(page.total).toBe(1);
  });

  it('should fall back to the last real page when asked for one past the end', async () => {
    // WHEN: a page past the end is requested
    const page = await listPage(householdId, 99, PAGE_SIZE);

    // THEN: the last page that exists, and it says so — the pager is drawn from this, not the URL
    expect(page.page).toBe(3);
    expect(page.items.map((shop) => shop.name)).toEqual([10, 11].map(shopName));
  });

  it('should stay on the first page of an empty list rather than clamping to zero', async () => {
    // GIVEN: a household with no shops at all
    const { householdId: emptyHouseholdId } = await createHousehold('paged-empty');

    // WHEN: its first page is read
    const page = await listPage(emptyHouseholdId, 1, PAGE_SIZE);

    // THEN: there should be one empty page, not a page numbered 0
    expect(page).toMatchObject({ items: [], page: 1, total: 0 });
  });

  it('should scope the total to the household, so another household cannot inflate the pager', async () => {
    // GIVEN: a second household holding shops of its own
    const { householdId: otherHouseholdId } = await createHousehold('paged-other');
    await db.insert(schema.store).values({ householdId: otherHouseholdId, name: shopName(0) });

    // WHEN: the first household's list is read
    const page = await listPage(householdId, 1, PAGE_SIZE);

    // THEN: the count should be its own
    expect(page.total).toBe(TOTAL);
  });
});

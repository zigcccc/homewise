import { randomUUID } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';

import { db, schema } from '#db/core';
import { StoresService } from '#modules/stores/stores.service';

/**
 * `readPagedList`, driven through a real service against a real Postgres.
 *
 * Everything here needs more rows than a household would ever be seeded with, which is what puts it
 * out of E2E's reach: page boundaries only exist once there are enough rows to have one, and the
 * clamp only fires on a page that stopped existing between two requests.
 *
 * Shops are the subject because they are the thinnest paginated list — a name, a sort key and a
 * follow-up count — so a failure here is the pagination and not the module.
 *
 * What is deliberately **not** covered: the `asc(id)` tiebreaker every paginated `orderBy` ends with.
 * Postgres returns tied rows in a consistent order at any table size a test can build, so a test for
 * it passes just as well without it — and a test that cannot fail is worse than none. It stays a
 * design invariant, commented at each `orderBy`.
 */

/** A household of this file's own, so it can't collide with another test file's rows. */
async function createHousehold(label: string) {
  const suffix = randomUUID();
  const [owner] = await db
    .insert(schema.user)
    .values({ email: `${label}-${suffix}@example.test`, id: `user-${label}-${suffix}`, name: 'Test Owner' })
    .returning();
  const [household] = await db
    .insert(schema.household)
    .values({ name: `${label} ${suffix}`, ownerId: owner!.id })
    .returning();

  return household!.id;
}

/** Names that sort in the order they were written, so an assertion can name the row it expects. */
const shopName = (index: number) => `Shop ${String(index).padStart(3, '0')}`;

const listPage = (householdId: number, page: number, pageSize: number) =>
  StoresService.list(householdId, { page, pageSize, search: undefined, sortDirection: 'asc', sortKey: 'name' });

/** Twelve shops, so 5 to a page makes three pages and the last one is deliberately partial. */
const TOTAL = 12;
const PAGE_SIZE = 5;

let householdId: number;

beforeAll(async () => {
  householdId = await createHousehold('paged');

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

    // THEN: the three pages together should be the whole list, each row exactly once
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

    // THEN: the total should describe the filtered list — a pager counting the unfiltered table
    // would offer pages that render empty
    expect(page.items.map((shop) => shop.name)).toEqual([shopName(7)]);
    expect(page.total).toBe(1);
  });

  it('should fall back to the last real page when asked for one past the end', async () => {
    // GIVEN: a page number that was valid until rows were deleted out from under the reader
    // WHEN: that page is requested
    const page = await listPage(householdId, 99, PAGE_SIZE);

    // THEN: it should answer with the last page that exists, and say so — a pager drawn from the URL
    // instead would read "page 99 of 3" over an empty table
    expect(page.page).toBe(3);
    expect(page.items.map((shop) => shop.name)).toEqual([10, 11].map(shopName));
  });

  it('should stay on the first page of an empty list rather than clamping to zero', async () => {
    // GIVEN: a household with no shops at all
    const emptyHouseholdId = await createHousehold('paged-empty');

    // WHEN: its first page is read
    const page = await listPage(emptyHouseholdId, 1, PAGE_SIZE);

    // THEN: there should be one empty page, not a page numbered 0
    expect(page).toMatchObject({ items: [], page: 1, total: 0 });
  });

  it('should scope the total to the household, so another household cannot inflate the pager', async () => {
    // GIVEN: a second household holding shops of its own
    const otherHouseholdId = await createHousehold('paged-other');
    await db.insert(schema.store).values({ householdId: otherHouseholdId, name: shopName(0) });

    // WHEN: the first household's list is read
    const page = await listPage(householdId, 1, PAGE_SIZE);

    // THEN: the count should be its own
    expect(page.total).toBe(TOTAL);
  });
});

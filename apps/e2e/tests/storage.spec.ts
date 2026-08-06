import { expect, test } from '@playwright/test';

import { SEED_STORAGE_ITEMS, SEED_STORAGE_LOCATIONS } from '@homewise/server/seed-fixtures';

import { StorageItemsPage, StorageLocationsPage } from '../pages/storage.page';
import { API_URL } from '../playwright.config';

const [GARAGE, CELLAR] = SEED_STORAGE_LOCATIONS;
const OVERDUE_ITEM = SEED_STORAGE_ITEMS.find((item) => item.name === 'Camping tent');

test.describe('storage', () => {
  // Every spec is self-contained: it creates uniquely-named data and removes it, so it's
  // idempotent across reruns and never mutates the shared seed fixtures.

  test('adds, renames, searches and deletes a location', async ({ page }) => {
    const locations = new StorageLocationsPage(page);
    await locations.goto();

    const name = `E2E Location ${Date.now()}`;
    const renamed = `${name} renamed`;

    try {
      await locations.add(name, 'Behind the house');
      await expect(locations.card(name)).toBeVisible();
      await expect(locations.card(name)).toContainText('Behind the house');
      await expect(locations.card(name)).toContainText('0 items');

      await locations.renameFromDetail(name, renamed);
      await expect(page.getByRole('heading', { level: 1, name: renamed })).toBeVisible();

      // Search filters down to just this card; a seeded location drops out.
      await locations.goto();
      await locations.search(renamed);
      await expect(locations.card(renamed)).toBeVisible();
      await expect(locations.card(GARAGE.name)).toBeHidden();

      await locations.search('');
      await locations.delete(renamed);
      await expect(locations.card(renamed)).toBeHidden();
    } finally {
      await locations.goto();
      await locations.search('');
      await locations.deleteIfPresent(name);
      await locations.deleteIfPresent(renamed);
    }
  });

  test('rejects a location whose name is already taken', async ({ page }) => {
    const locations = new StorageLocationsPage(page);
    await locations.goto();

    // The seeded name, in a different case — the index deduplicates case-insensitively.
    const dialog = await locations.addExpectingError(GARAGE.name.toLowerCase());

    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('is already a storage location');
  });

  test('drops a pin on the map and keeps it', async ({ page }) => {
    const locations = new StorageLocationsPage(page);
    await locations.goto();

    const name = `E2E Pinned ${Date.now()}`;

    try {
      await locations.addWithPin(name);
      await locations.open(name);

      // A pinned location gets a map and a way out to a maps app; an unpinned one gets neither.
      await expect(page.locator('.leaflet-container')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Directions' })).toBeVisible();

      await locations.goto();
      await locations.open(CELLAR.name);
      await expect(page.getByRole('link', { name: 'Directions' })).toBeHidden();
    } finally {
      await locations.goto();
      await locations.search('');
      await locations.deleteIfPresent(name);
    }
  });

  test('adds, renames, searches and deletes an item', async ({ page }) => {
    const items = new StorageItemsPage(page);
    await items.goto();

    const name = `E2E Item ${Date.now()}`;
    const renamed = `${name} renamed`;

    try {
      await items.add({ location: GARAGE.name, name, notes: 'Third shelf, blue crate', quantity: 3 });
      await expect(items.row(name)).toBeVisible();
      await expect(items.row(name)).toContainText('Third shelf, blue crate');
      await expect(items.row(name)).toContainText(GARAGE.name);
      // Nothing is out until it's lent.
      await expect(items.row(name)).toContainText('Here');

      await items.renameInline(name, renamed);
      await expect(items.row(renamed)).toBeVisible();
      // The notes survived the rename's refetch rather than being read back off a stale row.
      await expect(items.row(renamed)).toContainText('Third shelf, blue crate');

      // The global search is the point of this page — one term, every location.
      await items.search(renamed);
      await expect(items.row(renamed)).toBeVisible();
      await expect(items.row(SEED_STORAGE_ITEMS[0].name)).toBeHidden();

      await items.search('');
      await items.delete(renamed);
      await expect(items.row(renamed)).toBeHidden();
    } finally {
      await items.goto();
      await items.search('');
      await items.deleteIfPresent(name);
      await items.deleteIfPresent(renamed);
    }
  });

  test('rejects an item with no name', async ({ page }) => {
    const items = new StorageItemsPage(page);
    await items.goto();

    const dialog = await items.addExpectingError(GARAGE.name);

    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Name must contain at least 1 character');
  });

  test('moves an item between locations', async ({ page }) => {
    const items = new StorageItemsPage(page);
    const locations = new StorageLocationsPage(page);
    const name = `E2E Movable ${Date.now()}`;

    try {
      await items.goto();
      await items.add({ location: GARAGE.name, name });
      await expect(items.row(name)).toContainText(GARAGE.name);

      await items.moveTo(name, CELLAR.name);
      await expect(items.row(name)).toContainText(CELLAR.name);

      // It really left the one and arrived in the other, not just relabelled a cell.
      await locations.goto();
      await locations.open(CELLAR.name);
      await expect(items.row(name)).toBeVisible();

      await locations.goto();
      await locations.open(GARAGE.name);
      await expect(items.row(name)).toBeHidden();
    } finally {
      await items.goto();
      await items.search('');
      await items.deleteIfPresent(name);
    }
  });

  test('lends an item to a new contact and takes it back', async ({ page }) => {
    const items = new StorageItemsPage(page);
    const name = `E2E Lendable ${Date.now()}`;
    const borrower = `E2E Borrower ${Date.now()}`;

    try {
      await items.goto();
      await items.add({ location: GARAGE.name, name });
      await expect(items.row(name)).toContainText('Here');

      await items.lendToNewContact(name, borrower);
      await expect(items.row(name)).toContainText('On loan');
      await expect(items.row(name)).toContainText(borrower);

      // The loan filter finds it, and the "here" filter no longer does.
      await items.filterByStatus('On loan');
      await expect(items.row(name)).toBeVisible();
      await items.filterByStatus('Here');
      await expect(items.row(name)).toBeHidden();

      await items.filterByStatus('All items');
      await items.markReturned(name);
      await expect(items.row(name)).toContainText('Here');
      await expect(items.row(name)).not.toContainText(borrower);
    } finally {
      await items.goto();
      await items.search('');
      await items.deleteIfPresent(name);
    }
  });

  test('filters and sorts the seeded items', async ({ page }) => {
    const items = new StorageItemsPage(page);
    await items.goto();

    // The seeded loans are anchored to today, so an overdue one is always overdue.
    await items.filterByStatus('Overdue');
    await expect(items.row(OVERDUE_ITEM!.name)).toBeVisible();
    await expect(items.row(SEED_STORAGE_ITEMS[0].name)).toBeHidden();

    await items.filterByStatus('All items');

    // Sorting both ways puts a different row first.
    const firstRow = page.getByRole('row').nth(1);
    const ascending = await firstRow.textContent();

    await page.getByRole('button', { name: 'A → Z' }).click();
    await expect(page.getByRole('button', { name: 'Z → A' })).toBeVisible();
    await expect(firstRow).not.toHaveText(ascending ?? '');
  });

  test('deleting a location warns about what goes with it', async ({ page }) => {
    const locations = new StorageLocationsPage(page);
    const items = new StorageItemsPage(page);
    const location = `E2E Doomed ${Date.now()}`;
    const item = `E2E Doomed item ${Date.now()}`;

    try {
      await locations.goto();
      await locations.add(location);

      await items.goto();
      await items.add({ location, name: item });

      const dialog = await locations.openDeleteFromDetail(location);
      // Cascading is the whole reason this warning exists — the count has to be in it.
      await expect(dialog).toContainText('1 item');
      await dialog.getByRole('button', { name: 'Delete location' }).click();
      await expect(dialog).toBeHidden();

      // Its contents went with it rather than being orphaned.
      await items.goto();
      await items.search(item);
      await expect(items.row(item)).toBeHidden();
    } finally {
      await items.goto();
      await items.search('');
      await items.deleteIfPresent(item);
      await locations.goto();
      await locations.search('');
      await locations.deleteIfPresent(location);
    }
  });

  test('keeps an open inline rename on its own row when the list shifts underneath it', async ({ page }) => {
    const items = new StorageItemsPage(page);
    const stamp = Date.now();
    // Two adjacent names, so the row that arrives lands directly above the one being renamed and
    // nothing else can end up between them — the shift is exactly one position.
    const neighbour = `E2E Shift ${stamp} a`;
    const mine = `E2E Shift ${stamp} b`;
    const renamed = `E2E Shifted ${stamp}`;

    try {
      await items.goto();
      await items.add({ location: GARAGE.name, name: mine });
      await items.openInlineRename(mine, renamed);

      // Another member adds an item that sorts above this one. It goes through the API rather than
      // the UI because clicking anything on the page would blur the editor and commit it early —
      // and realtime refetching the list under an open editor is the case being covered.
      const locations = await page.context().request.get(`${API_URL}/storage-locations`);
      const garageId = (await locations.json()).find((row: { name: string }) => row.name === GARAGE.name).id;
      const response = await page.context().request.post(`${API_URL}/storage-items`, {
        multipart: { locationId: String(garageId), name: neighbour },
      });
      expect(response.ok()).toBe(true);
      await expect(items.row(neighbour)).toBeVisible();

      await items.commitInlineRename();

      // The rename has to follow the row it was opened on. Keyed by position, the editor would have
      // moved onto whichever item took the old index — renaming a row nobody touched.
      await expect(items.row(renamed)).toBeVisible();
      await expect(items.row(neighbour)).toBeVisible();
      await expect(items.row(mine)).toBeHidden();
    } finally {
      await items.goto();
      await items.search('');
      await items.deleteIfPresent(renamed);
      await items.deleteIfPresent(mine);
      await items.deleteIfPresent(neighbour);
    }
  });
});

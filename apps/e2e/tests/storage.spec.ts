import { SEED_STORAGE_ITEMS, SEED_STORAGE_LOCATIONS } from '@homewise/server/seed-fixtures';

import { StorageItemsPage, StorageLocationsPage } from '../pages/storage.page';
import { API_URL } from '../playwright.config';
import { deleteOutOfBand } from '../support/records';
import { expect, type Page, test } from '../support/test';

const [GARAGE, CELLAR] = SEED_STORAGE_LOCATIONS;

/**
 * Stores something as another member would, without touching this page. Anything done through the UI
 * would close the menu the spec is trying to prove survives.
 */
async function addItemOutOfBand(page: Page, name: string) {
  const locations = await page.context().request.get(`${API_URL}/storage-locations`);
  expect(locations.ok(), 'Could not read the storage locations.').toBe(true);

  const garage = (await locations.json()).find((row: { name: string }) => row.name === GARAGE.name);
  expect(garage, `The seeded location "${GARAGE.name}" is missing.`).toBeDefined();

  const created = await page.context().request.post(`${API_URL}/storage-items`, {
    multipart: { locationId: String(garage.id), name },
  });
  expect(created.ok()).toBe(true);
}

const OVERDUE_ITEM = SEED_STORAGE_ITEMS.find((item) => item.name === 'Camping tent');

test.describe('storage', () => {
  // Every spec is self-contained: it creates uniquely-named data and removes it, so it's
  // idempotent across reruns and never mutates the shared seed fixtures.

  test('adds, renames, searches and deletes a location', async ({ page }) => {
    const locations = new StorageLocationsPage(page);
    await locations.goto();

    const stamp = Date.now();
    // Disjoint, not `${name} renamed`: the card locator matches on substring, so a name the new one
    // contains would go on matching it after the rename and resolve two elements if both existed.
    const name = `E2E Location ${stamp}`;
    const renamed = `E2E Renamed location ${stamp}`;

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

      // Both tile providers ask for visible credit, and `attributionControl={false}` silently took
      // it away once — the string was still passed to the tile layer, with nothing left to draw it.
      const attribution = page.locator('.leaflet-control-attribution');
      await expect(attribution.getByRole('link', { name: 'OpenStreetMap' })).toBeVisible();
      await expect(attribution.getByRole('link', { name: 'CARTO' })).toBeVisible();

      await locations.goto();
      await locations.open(CELLAR.name);
      await expect(page.getByRole('link', { name: 'Directions' })).toBeHidden();
    } finally {
      await locations.goto();
      await locations.search('');
      await locations.deleteIfPresent(name);
    }
  });

  test('keeps a dialog above the map behind it', async ({ page }) => {
    const locations = new StorageLocationsPage(page);
    await locations.goto();

    // The seeded garage is pinned, so the overview map is drawn.
    await expect(locations.overviewMap.container).toBeVisible();

    // The dialog's overlay dims the map, zoom button and all. Leaflet's panes and controls carry
    // z-indexes in the hundreds, so left unisolated they paint over that overlay and nothing dims.
    const before = await locations.overviewMap.settledControlShot();
    await locations.openAddDialog();
    expect((await locations.overviewMap.settledControlShot()).equals(before)).toBe(false);
  });

  test('adds, renames, searches and deletes an item', async ({ page }) => {
    const items = new StorageItemsPage(page);
    await items.goto();

    const stamp = Date.now();
    // Disjoint names, for the reason the location spec above gives.
    const name = `E2E Item ${stamp}`;
    const renamed = `E2E Renamed item ${stamp}`;

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

      // Quantity edits in place too, and refuses what the column would.
      const quantity = await items.setQuantityInline(renamed, '7');
      await expect(items.row(renamed)).toContainText('7');

      await items.setQuantityInline(renamed, 'lots');
      // A refused value keeps the editor open carrying what was typed, rather than losing it.
      await expect(quantity).toHaveValue('lots');
      await quantity.press('Escape');
      await expect(items.row(renamed)).toContainText('7');

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
    const bystander = `E2E Bystander ${Date.now()}`;

    try {
      await items.goto();
      await items.add({ location: GARAGE.name, name });
      await expect(items.row(name)).toContainText(GARAGE.name);

      // Another member stores something while the menu is open. Every location's item count moves,
      // which refetches the list the "Move to" menu reads — and if that reaches the table's columns,
      // `flexRender` remounts every cell and this menu closes under the user's hand.
      await items.openRowMenu(name);
      const refetched = page.waitForResponse(
        (response) => response.url().includes('/storage-items?') && response.request().method() === 'GET'
      );
      await addItemOutOfBand(page, bystander);
      await refetched;

      // The menu is asserted on rather than the row: it's modal, so the table behind it is
      // `aria-hidden` and out of reach while it's open — which is also the whole point.
      await expect(page.getByRole('menuitem', { name: 'Move to' })).toBeVisible();
      await items.moveToFromOpenMenu(CELLAR.name);
      await expect(items.row(name)).toContainText(CELLAR.name);

      // It really left the one and arrived in the other, not just relabelled a cell.
      await locations.goto();
      await locations.open(CELLAR.name);
      await expect(items.row(name)).toBeVisible();

      await locations.goto();
      await locations.open(GARAGE.name);
      await expect(items.row(name)).toBeHidden();

      // And back, this time hovering the submenu open the way a person does. The keyboard route
      // above is the one the shifting-list case needs, but on its own it proved nothing about the
      // pointer: a sub-trigger that never opens under the mouse still answers `ArrowRight`.
      await items.goto();
      await items.search(name);
      await items.moveTo(name, GARAGE.name);
      await expect(items.row(name)).toContainText(GARAGE.name);
    } finally {
      try {
        await items.goto();
        await items.search('');
        await items.deleteIfPresent(name);
      } finally {
        // The bystander went in behind the app's back, so it comes out the same way — left behind it
        // would accumulate one row per run in the household every other spec reads.
        await deleteOutOfBand(page, 'storage-items', bystander);
      }
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
      try {
        await items.goto();
        await items.search('');
        await items.deleteIfPresent(name);
      } finally {
        // The loan minted a contact, which outlives the item. Removed out of band rather than by
        // detouring this spec through the address book — left behind, it grows the list this
        // feature's combobox loads on every run.
        await deleteOutOfBand(page, 'contacts', borrower);
      }
    }
  });

  test('keeps the page behind the lend dialog while the dialog loads', async ({ page }) => {
    const items = new StorageItemsPage(page);
    const name = `E2E Loading ${Date.now()}`;

    // The address book is *delayed*, not faked — the real server still answers it. Nothing else in
    // the suite touches the network, and this is why it's worth the exception: the defect is a
    // window rather than an end state, and Playwright's auto-waiting would sit through it. Without a
    // Suspense boundary of its own the dialog suspends to the *route's*, and for as long as this
    // request is in flight the whole page behind it is replaced by a spinner.
    try {
      await items.goto();
      await items.add({ location: GARAGE.name, name });

      // Installed after the setup, so nothing but the dialog's own request waits on it.
      await page.route('**/contacts', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        await route.continue();
      });

      await items.openRowMenu(name);
      await page.getByRole('menuitem', { name: 'Lend it out' }).click();

      // The dialog is up straight away carrying its own loading state, and the page it was opened
      // from is still underneath it.
      await expect(page.getByRole('dialog').filter({ hasText: 'Lend' })).toBeVisible({ timeout: 1000 });
      await expect(page.locator('h1')).toBeVisible();
    } finally {
      // The delayed request is still in flight; `ignoreErrors` is what stops its late `continue`
      // landing on a page this cleanup has already navigated away from.
      await page.unrouteAll({ behavior: 'ignoreErrors' });
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
    // `innerText`, because that is what `toHaveText` matches against — `textContent` returns the raw
    // nodes with their original whitespace, so an unchanged row would compare unequal to itself.
    const ascending = await firstRow.innerText();

    await page.getByRole('button', { name: 'A → Z' }).click();
    await expect(page.getByRole('button', { name: 'Z → A' })).toBeVisible();
    await expect(firstRow).not.toHaveText(ascending);

    // The label follows the column: "descending" on a date reads as newest-first, not Z → A.
    await items.selectSortKey('Date added');
    await expect(items.sortDirectionButton()).toHaveText('Newest first');
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
      await addItemOutOfBand(page, neighbour);
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

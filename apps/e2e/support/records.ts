import { type Page } from '@playwright/test';

import { MAX_PAGE_SIZE } from '@homewise/server/models';

import { API_URL } from '../playwright.config';

/**
 * Removes something a spec created behind the app's back, so a rerun starts where the last one did.
 *
 * It exists for rows a spec creates somewhere other than where they are deleted: a contact minted as
 * part of a loan, or one unlinked from a profile — unlinking leaves it in the household. The address
 * book can remove either, but making a storage or medical spec detour through a third page to clean
 * up would couple it to a feature it isn't testing. Left behind, they grow the list every run loads.
 *
 * A refused request raises rather than passes quietly — this is the only thing between the household
 * and a row that outlives every later run, and a silent 4xx here looks exactly like a clean pass. For
 * the same reason, call it from an inner `finally`, so a failed UI teardown can't skip it.
 */
export async function deleteOutOfBand(page: Page, path: 'contacts' | 'storage-items', name: string) {
  // Searched and given a full page: these lists are paginated, and the row is rarely on page one.
  const list = await page
    .context()
    .request.get(`${API_URL}/${path}?search=${encodeURIComponent(name)}&pageSize=${MAX_PAGE_SIZE}`);

  if (!list.ok()) {
    throw new Error(`Could not list ${path} to clean up "${name}": ${list.status()} ${list.statusText()}`);
  }

  const { items } = (await list.json()) as { items: { id: number; name: string }[] };
  const row = items.find((candidate) => candidate.name === name);

  if (row) {
    const deleted = await page.context().request.delete(`${API_URL}/${path}/${row.id}`);

    if (!deleted.ok()) {
      throw new Error(`Could not delete ${path} "${name}": ${deleted.status()} ${deleted.statusText()}`);
    }
  }
}

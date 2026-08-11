import { type Page } from '@playwright/test';

import { API_URL } from '../playwright.config';

/**
 * Removes something a spec created behind the app's back, so a rerun starts where the last one did.
 *
 * It exists for rows the UI gives you no way to delete: a contact minted as part of a loan, or one
 * unlinked from a profile (removing it there leaves it in the household, and there is no Contacts
 * page). Left behind, they grow the address book every run's comboboxes load.
 */
export async function deleteOutOfBand(page: Page, path: 'contacts' | 'storage-items', name: string) {
  const list = await page.context().request.get(`${API_URL}/${path}`);
  const row = (await list.json()).find((candidate: { name: string }) => candidate.name === name);

  if (row) {
    await page.context().request.delete(`${API_URL}/${path}/${row.id}`);
  }
}

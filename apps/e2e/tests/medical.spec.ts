import { expect, test } from '@playwright/test';

import { MedicalPage } from '../pages/medical.page';
import { stubPlaceSearch } from '../support/places';
import { createChildProfile, removeManagedMember } from '../support/profiles';
import { deleteOutOfBand } from '../support/records';

test.describe('medical information', () => {
  test('sets the medical ID and creates, edits, links, and removes a contact', async ({ page }) => {
    const kidName = `E2E Med Kid ${Date.now()}`;
    await createChildProfile(page, kidName);

    try {
      const medical = new MedicalPage(page);

      // Medical ID number persists across a reload.
      await medical.setMedicalId('INS-12345');
      await page.reload();
      await expect(page.getByLabel('Medical ID number')).toHaveValue('INS-12345');

      const contactName = `Dr. E2E ${Date.now()}`;
      const renamed = `${contactName} (updated)`;

      // Create → edit → unlink → re-link an existing → unlink again.
      await medical.addContact(contactName);
      await expect(medical.contactItem(contactName)).toBeVisible();

      await medical.editContact(contactName, renamed);
      await expect(medical.contactItem(renamed)).toBeVisible();

      await medical.removeContact(renamed);
      await expect(medical.contactItem(renamed)).toBeHidden();

      // The contact stays in the household, so it can be linked again.
      await medical.linkExistingContact(renamed);
      await expect(medical.contactItem(renamed)).toBeVisible();

      await medical.removeContact(renamed);
      await expect(medical.contactItem(renamed)).toBeHidden();
    } finally {
      await removeManagedMember(page, kidName);
    }
  });

  test('fills a contact address from the place search', async ({ page }) => {
    const kidName = `E2E Addr Kid ${Date.now()}`;
    await createChildProfile(page, kidName);

    const picked = `Dr. E2E Picked ${Date.now()}`;
    const typed = `Dr. E2E Typed ${Date.now()}`;
    // Street *then* number: the European order `formatAddress` deliberately writes.
    const pickedAddress = 'Slovenska cesta 12, Ljubljana, Slovenia';
    const typedAddress = 'Nowhere in particular 7';

    await stubPlaceSearch(page, {
      Slovenska: [
        { name: 'Klinični center', street: 'Zaloška cesta', housenumber: '2', city: 'Ljubljana', country: 'Slovenia' },
        { street: 'Slovenska cesta', housenumber: '12', city: 'Ljubljana', country: 'Slovenia' },
      ],
    });

    try {
      const medical = new MedicalPage(page);

      // Searching and taking a suggestion writes the whole one-line address into the field.
      const dialog = await medical.openCreateContactDialog();
      await dialog.getByLabel('Name', { exact: true }).fill(picked);
      await medical.pickAddress('Slovenska', pickedAddress);
      await expect(medical.addressField).toHaveValue(pickedAddress);

      await dialog.getByRole('button', { name: 'Create contact' }).click();
      await expect(dialog).toBeHidden();
      await expect(medical.contactItem(picked)).toContainText(pickedAddress);

      // An address the geocoder has nothing for is still typed and saved — and Enter still submits
      // the dialog from this field, as it does from the ones above it. cmdk's root swallows every
      // Enter, so without the autocomplete handing it back this field alone would ignore the key.
      const second = await medical.openCreateContactDialog();
      await second.getByLabel('Name', { exact: true }).fill(typed);
      await medical.addressField.fill(typedAddress);
      await expect(page.getByText(`No places match "${typedAddress}"`)).toBeVisible();

      await medical.addressField.press('Enter');
      await expect(second).toBeHidden();
      await expect(medical.contactItem(typed)).toContainText(typedAddress);
    } finally {
      try {
        await removeManagedMember(page, kidName);
      } finally {
        // Unlinking leaves the contact in the household, and there is no Contacts page to remove it
        // from — so both go out of band, or they pile up in every later run's address book. Both,
        // whichever way the member teardown went, and `Promise.all` rather than two awaits: it has
        // the second request away before the first can reject.
        await Promise.all([deleteOutOfBand(page, 'contacts', picked), deleteOutOfBand(page, 'contacts', typed)]);
      }
    }
  });
});

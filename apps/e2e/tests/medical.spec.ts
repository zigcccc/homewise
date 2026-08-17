import { MedicalPage } from '../pages/medical.page';
import { stubPlaceSearch } from '../support/places';
import { createChildProfile } from '../support/profiles';
import { deleteByName, deleteMemberNamed } from '../support/records';
import { expect, test } from '../support/test';

test.describe('medical information', () => {
  test('sets the medical ID and creates, edits, links, and removes a contact', async ({ cleanup, page }) => {
    const kidName = `E2E Med Kid ${Date.now()}`;
    const contactName = `Dr. E2E ${Date.now()}`;
    const renamed = `${contactName} (updated)`;

    // The member is *eligible for meals*, so one left behind by a timed-out run turns the meal
    // plan's coverage spec red on the same worker. Its contact survives the last unlink by design —
    // that is what the re-link step proves — so it needs removing too, under either name.
    cleanup.add((api) => deleteMemberNamed(api, kidName));
    cleanup.add((api) => deleteByName(api, 'contacts', contactName));
    cleanup.add((api) => deleteByName(api, 'contacts', renamed));

    await createChildProfile(page, kidName);

    const medical = new MedicalPage(page);

    // Medical ID number persists across a reload.
    await medical.setMedicalId('INS-12345');
    await page.reload();
    await expect(page.getByLabel('Medical ID number')).toHaveValue('INS-12345');

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
  });

  test('fills a contact address from the place search', async ({ cleanup, page }) => {
    const kidName = `E2E Addr Kid ${Date.now()}`;
    const picked = `Dr. E2E Picked ${Date.now()}`;
    const typed = `Dr. E2E Typed ${Date.now()}`;

    // Unlinking leaves a contact in the household, so both go out of band rather than sending this
    // spec off to the address book. The child member goes too — it is *eligible for meals*, so one
    // left behind by a timed-out run turns the meal plan's coverage spec red on the same worker.
    cleanup.add((api) => deleteMemberNamed(api, kidName));
    cleanup.add((api) => deleteByName(api, 'contacts', picked));
    cleanup.add((api) => deleteByName(api, 'contacts', typed));

    await createChildProfile(page, kidName);

    // Street *then* number: the European order `formatAddress` deliberately writes.
    const pickedAddress = 'Slovenska cesta 12, Ljubljana, Slovenia';
    const typedAddress = 'Nowhere in particular 7';

    await stubPlaceSearch(page, {
      Slovenska: [
        { name: 'Klinični center', street: 'Zaloška cesta', housenumber: '2', city: 'Ljubljana', country: 'Slovenia' },
        { street: 'Slovenska cesta', housenumber: '12', city: 'Ljubljana', country: 'Slovenia' },
      ],
    });

    const medical = new MedicalPage(page);

    const dialog = await medical.openCreateContactDialog();
    await dialog.getByLabel('Name', { exact: true }).fill(picked);

    // The field opts out of every browser-drawn assist, because each one paints its own popup on
    // top of the suggestion list this box exists to show. Nothing on screen says so, so it would
    // be deleted by anyone tidying attributes — assert it rather than rediscover it in a bug.
    await expect(medical.addressField).toHaveAttribute('autocomplete', 'off');
    await expect(medical.addressField).toHaveAttribute('spellcheck', 'false');

    // Searching and taking a suggestion writes the whole one-line address into the field.
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
  });
});

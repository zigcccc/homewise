import { expect, test } from '@playwright/test';

import { MedicalPage } from '../pages/medical.page';
import { createChildProfile, removeManagedMember } from '../support/profiles';

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
});

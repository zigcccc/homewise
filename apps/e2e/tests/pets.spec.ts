import path from 'node:path';

import { HouseholdMembersPage } from '../pages/household-members.page';
import { MedicalPage } from '../pages/medical.page';
import { PetsPage } from '../pages/pets.page';
import { createPetProfile, removeManagedMember } from '../support/profiles';
import { expect, test } from '../support/test';

const AVATAR_FIXTURE = path.resolve(import.meta.dirname, '..', 'support', 'fixtures', 'avatar.png');

test.describe('pets', () => {
  // Self-contained: creates its own pet member + profile and removes the member
  // at the end (which cascade-deletes the profile), never touching the seed data.
  test('creates a profile, edits general info, manages photo and a vet contact, cleans up', async ({ page }) => {
    const name = `E2E Pet ${Date.now()}`;
    await createPetProfile(page, name);

    try {
      const pets = new PetsPage(page);

      // Edit general info and confirm it survives a reload.
      await pets.setType('Dog');
      await pets.setBreed('Golden Retriever');
      await pets.setDateOfBirth('01. 03. 2021');
      await pets.setJoinedFamilyOn('15. 04. 2021');
      await pets.setSex('Male');
      await pets.saveGeneral();

      await page.reload();
      await expect(page.getByLabel('Breed')).toHaveValue('Golden Retriever');
      await expect(page.getByLabel('Date of birth')).toHaveValue('01. 03. 2021');
      await expect(page.getByLabel('Joined the family')).toHaveValue('15. 04. 2021');

      // Vet contact (the medical card relabels `medical` as veterinary for pets).
      const vetName = `Vet E2E ${Date.now()}`;
      const medical = new MedicalPage(page);
      await medical.addContact(vetName);
      await expect(medical.contactItem(vetName)).toBeVisible();
      await medical.removeContact(vetName);
      await expect(medical.contactItem(vetName)).toBeHidden();

      // Photo upload + removal.
      await expect(pets.photoButton).toHaveText('Add a photo');
      await pets.uploadPhoto(AVATAR_FIXTURE);
      await expect(pets.photoButton).toHaveText('Change photo');
      await pets.removePhoto();
      await expect(pets.photoButton).toHaveText('Add a photo');

      // The pet appears as a card on the list.
      await pets.goto();
      await expect(pets.profileCard(name)).toBeVisible();
    } finally {
      await removeManagedMember(page, name);
      await expect(new HouseholdMembersPage(page).memberRow(name)).toBeHidden();
    }
  });
});

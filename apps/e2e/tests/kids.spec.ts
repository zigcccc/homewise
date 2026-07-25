import path from 'node:path';

import { expect, test } from '@playwright/test';

import { HouseholdMembersPage } from '../pages/household-members.page';
import { KidsPage } from '../pages/kids.page';

const AVATAR_FIXTURE = path.resolve(import.meta.dirname, '..', 'support', 'fixtures', 'avatar.png');

test.describe('kids', () => {
  // Self-contained: creates its own child member + profile and removes the member
  // at the end (which cascade-deletes the profile), never touching the seed data.
  test('creates a profile, edits general info, manages the photo, and cleans up', async ({ page }) => {
    const members = new HouseholdMembersPage(page);
    const kids = new KidsPage(page);
    const name = `E2E Kid ${Date.now()}`;

    await members.goto();
    await members.addManagedMember(name); // defaults to the Child role

    try {
      await kids.goto();
      await expect(kids.createSuggestion(name)).toBeVisible();
      await kids.createProfileFor(name);

      // Edit the general info and confirm it survives a reload.
      await kids.setDateOfBirth('15. 06. 2020');
      await kids.setSex('Female');
      await kids.setMaskedField('nationalId', 'AB1234567');
      await kids.saveGeneral();

      await page.reload();
      await expect(page.getByLabel('Date of birth')).toHaveValue('15. 06. 2020');
      await expect(page.locator('#nationalId')).toHaveValue(/4567$/);

      // The child appears as a card on the list.
      await kids.goto();
      await expect(kids.profileCard(name)).toBeVisible();
      await kids.profileCard(name).click();
      await page.waitForURL(/\/family\/kids\/\d+\/general/);

      // Photo upload + removal (the button label reflects the current state).
      await expect(kids.photoButton).toHaveText('Add a photo');
      await kids.uploadPhoto(AVATAR_FIXTURE);
      await expect(kids.photoButton).toHaveText('Change photo');
      await kids.removePhoto();
      await expect(kids.photoButton).toHaveText('Add a photo');
    } finally {
      await members.goto();
      await members.removeMember(name);
      await expect(members.memberRow(name)).toBeHidden();
    }
  });
});

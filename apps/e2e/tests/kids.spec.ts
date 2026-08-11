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

      // An identifier with no value opens editable — no pencil to click through — and offers no actions at
      // all, copying nothing least of all. Asserting the attribute first is deliberate: it fails unless the
      // input exists, so the button count below can't pass against a form that simply isn't mounted yet.
      await expect(kids.identifierInput('nationalId')).not.toHaveAttribute('readonly');
      await expect(kids.maskedField('nationalId').getByRole('button')).toHaveCount(0);
      // Editable, but not asking to be typed into: opening the page must not drop the caret in either field.
      // Both are checked because the last one mounted is the one that would win an autofocus race.
      await expect(kids.identifierInput('nationalId')).not.toBeFocused();
      await expect(kids.identifierInput('taxId')).not.toBeFocused();

      // Edit the general info and confirm it survives a reload.
      await kids.setDateOfBirth('15. 06. 2020');
      await kids.setSex('Female');
      await kids.setMaskedField('nationalId', 'AB1234567');
      await kids.saveGeneral();

      await page.reload();
      await expect(page.getByLabel('Date of birth')).toHaveValue('15. 06. 2020');
      // Saved, so it comes back masked, read-only, and copyable.
      await expect(kids.identifierInput('nationalId')).toHaveValue(/4567$/);
      await expect(kids.identifierInput('nationalId')).toHaveAttribute('readonly');
      await expect(kids.maskedField('nationalId').getByRole('button', { name: 'Copy' })).toBeVisible();
      // Revealing is what earns the caret, so the pencil still focuses the field it opens.
      await kids.editIdentifierButton('nationalId').click();
      await expect(kids.identifierInput('nationalId')).toBeFocused();

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

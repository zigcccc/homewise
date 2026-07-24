import { expect, test } from '@playwright/test';

import { HouseholdMembersPage } from '../pages/household-members.page';

test.describe('household members', () => {
  // Self-contained: creates a uniquely-named member and removes it, so the test
  // is idempotent across reruns and never mutates the shared seed fixtures.
  test('adds and removes a managed member', async ({ page }) => {
    const members = new HouseholdMembersPage(page);
    await members.goto();

    const name = `E2E Member ${Date.now()}`;

    await members.addManagedMember(name);
    await expect(members.memberRow(name)).toBeVisible();

    await members.removeMember(name);
    await expect(members.memberRow(name)).toBeHidden();
  });
});

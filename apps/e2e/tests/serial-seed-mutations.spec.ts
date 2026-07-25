import { expect, test } from '@playwright/test';

import { SEED_HOUSEHOLD_NAME, SEED_SECOND_USER, SEED_USER } from '@homewise/server/seed-fixtures';

import { HouseholdMembersPage } from '../pages/household-members.page';
import { SettingsPage } from '../pages/settings.page';
import { UserProfilePage } from '../pages/user-profile.page';
import { SECOND_USER_STORAGE_STATE } from '../support/paths';

/**
 * The specs that mutate a **shared seed row** the rest of the suite observes:
 *   - the household name (the dashboard/auth specs assert it),
 *   - the seed user's name (ditto), and
 *   - household ownership (member removal, role changes, and every profile
 *     teardown are owner-only, so briefly de-owning the seed user would break
 *     anything running alongside it).
 *
 * They live in the `exclusive` Playwright project, which depends on `parallel`
 * and so runs only after every parallel spec has finished — and this file runs on
 * a single worker, so these mutators never overlap each other either. Each still
 * round-trips its change so a shared-DB rerun starts clean.
 */

test('renames the household and restores it', async ({ page }) => {
  const settings = new SettingsPage(page);
  await settings.goto();
  await expect(settings.heading(SEED_HOUSEHOLD_NAME)).toBeVisible();

  const newName = `E2E Household ${Date.now()}`;

  try {
    await settings.setHouseholdName(newName);
    await expect(settings.heading(newName)).toBeVisible();
  } finally {
    await settings.setHouseholdName(SEED_HOUSEHOLD_NAME);
  }
  await expect(settings.heading(SEED_HOUSEHOLD_NAME)).toBeVisible();
});

test('edits the user display name and restores it', async ({ page }) => {
  const profile = new UserProfilePage(page);
  await profile.goto();

  const newName = `Preview User ${Date.now()}`;

  try {
    await profile.setName(newName);
    await expect(profile.breadcrumb(newName)).toBeVisible();
  } finally {
    // Always restore — it drives the dashboard greeting other specs assert.
    await profile.setName(SEED_USER.name);
  }
  await expect(profile.breadcrumb(SEED_USER.name)).toBeVisible();
});

test('transfers household ownership to a member and back', async ({ page, browser }) => {
  const ownerMembers = new HouseholdMembersPage(page);
  await ownerMembers.goto();
  await expect(ownerMembers.memberRow(SEED_USER.name)).toContainText('(owner)');

  const secondContext = await browser.newContext({ storageState: SECOND_USER_STORAGE_STATE });
  const secondPage = await secondContext.newPage();
  const secondMembers = new HouseholdMembersPage(secondPage);

  try {
    // Forward: the seed owner transfers ownership to the second member.
    await ownerMembers.transferOwnershipTo(SEED_SECOND_USER.name);
    await expect(ownerMembers.memberRow(SEED_SECOND_USER.name)).toContainText('(owner)');

    // Backward: the second member, now owner, transfers it back to the seed user.
    await secondMembers.goto();
    await expect(secondMembers.memberRow(SEED_SECOND_USER.name)).toContainText('(owner)');
    await secondMembers.transferOwnershipTo(SEED_USER.name);
    await expect(secondMembers.memberRow(SEED_USER.name)).toContainText('(owner)');
  } finally {
    // Restore ownership, but always close the second context even if that throws.
    try {
      await restoreSeedOwner(secondMembers);
    } finally {
      await secondContext.close();
    }
  }
});

test('changes an account member’s role (owner action), then restores it', async ({ page }) => {
  // Mutates SEED_SECOND_USER (a shared seed member), so it lives here in the
  // exclusive project rather than the parallel one.
  const members = new HouseholdMembersPage(page);
  await members.goto();

  const row = members.memberRow(SEED_SECOND_USER.name);
  const roleSelect = row.getByRole('combobox');
  await expect(roleSelect).toContainText('Adult');

  try {
    await members.setMemberRole(SEED_SECOND_USER.name, 'Child');
    await expect(roleSelect).toContainText('Child');
  } finally {
    // Always restore the seed member's role so reruns start clean.
    await members.setMemberRole(SEED_SECOND_USER.name, 'Adult');
  }
  await expect(roleSelect).toContainText('Adult');
});

/**
 * Ensures the seed user is the owner again. If the forward transfer succeeded but
 * the restore didn't, the second member is still owner and can hand it back; if
 * ownership never moved, the second member isn't owner and this is a no-op.
 */
async function restoreSeedOwner(secondMembers: HouseholdMembersPage) {
  await secondMembers.goto();
  // isVisible() returns false for an absent "(owner)" marker without throwing, so
  // no catch is needed here — a genuine navigation/UI error should propagate rather
  // than be silently swallowed into "not owner" (which would skip the restore).
  const secondIsOwner = await secondMembers.memberRow(SEED_SECOND_USER.name).getByText('(owner)').isVisible();

  if (secondIsOwner) {
    await secondMembers.transferOwnershipTo(SEED_USER.name);
    await expect(secondMembers.memberRow(SEED_USER.name)).toContainText('(owner)');
  }
}

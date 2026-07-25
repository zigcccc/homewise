import { expect, test } from '@playwright/test';

import { HouseholdMembersPage } from '../pages/household-members.page';

test.describe('household members', () => {
  // Every spec is self-contained: it creates uniquely-named data and removes it,
  // so it's idempotent across reruns and never mutates the shared seed fixtures.

  test('adds and removes a managed member', async ({ page }) => {
    const members = new HouseholdMembersPage(page);
    await members.goto();

    const name = `E2E Member ${Date.now()}`;

    await members.addManagedMember(name);
    await expect(members.memberRow(name)).toBeVisible();

    await members.removeMember(name);
    await expect(members.memberRow(name)).toBeHidden();
  });

  test('edits a managed member’s name', async ({ page }) => {
    const members = new HouseholdMembersPage(page);
    await members.goto();

    const name = `E2E Edit ${Date.now()}`;
    const renamed = `${name} (renamed)`;

    await members.addManagedMember(name);
    await expect(members.memberRow(name)).toBeVisible();

    await members.editManagedMemberName(name, renamed);
    await expect(members.memberRow(renamed)).toBeVisible();

    await members.removeMember(renamed);
    await expect(members.memberRow(renamed)).toBeHidden();
  });

  test('sends an email invite and revokes it', async ({ page }) => {
    const members = new HouseholdMembersPage(page);
    await members.goto();

    const email = `e2e.invite+${Date.now()}@home-wise.app`;

    await members.inviteViaEmail(email);

    await members.goToInvitesTab();
    await expect(members.inviteRow(email)).toBeVisible();

    await members.revokeInvite(email);
    await expect(members.inviteRow(email)).toBeHidden();
  });

  test('invites an existing managed member to create an account, then revokes it', async ({ page }) => {
    const members = new HouseholdMembersPage(page);
    await members.goto();

    const name = `E2E Invitee ${Date.now()}`;
    const email = `e2e.existing+${Date.now()}@home-wise.app`;

    await members.addManagedMember(name);
    await expect(members.memberRow(name)).toBeVisible();

    await members.inviteManagedMemberToAccount(name, email);

    await members.goToInvitesTab();
    await expect(members.inviteRow(email)).toBeVisible();

    // Clean up: revoke the invite and remove the managed member.
    await members.revokeInvite(email);
    await expect(members.inviteRow(email)).toBeHidden();

    await members.goToMembersTab();
    await members.removeMember(name);
    await expect(members.memberRow(name)).toBeHidden();
  });

  // The account-member role change mutates a shared seed member, so it lives in
  // serial-seed-mutations.spec.ts (the exclusive project) alongside the other
  // shared-seed mutators, not here in the fully-parallel project.
});

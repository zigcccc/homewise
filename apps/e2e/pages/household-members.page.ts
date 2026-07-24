import { expect, type Locator, type Page } from '@playwright/test';

/** The "Manage household members" screen (`/manage/household-members`). */
export class HouseholdMembersPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/manage/household-members');
    // The members table is the default tab; wait for it to render.
    await expect(this.page.getByRole('button', { name: 'Add member' })).toBeVisible();
  }

  /** A members-table row for the given display name. */
  memberRow(name: string): Locator {
    return this.page.getByRole('row').filter({ hasText: name });
  }

  /** A pending-invites-table row for the given email. */
  inviteRow(email: string): Locator {
    return this.page.getByRole('row').filter({ hasText: email });
  }

  async goToMembersTab() {
    await this.page.getByRole('tab', { name: /Members/ }).click();
  }

  async goToInvitesTab() {
    await this.page.getByRole('tab', { name: /Pending invites/ }).click();
  }

  /**
   * Adds a managed (no-account) member via the "Add member" dialog's
   * "Add without account" tab. Role defaults to Child.
   */
  async addManagedMember(name: string) {
    await this.page.getByRole('button', { name: 'Add member' }).click();

    const dialog = this.page.getByRole('dialog');
    await dialog.getByRole('tab', { name: 'Add without account' }).click();
    // exact, so "Name" doesn't also match the "Nickname (optional)" field.
    await dialog.getByLabel('Name', { exact: true }).fill(name);
    await dialog.getByRole('button', { name: 'Add member' }).click();

    // Dialog closes on success.
    await expect(dialog).toBeHidden();
  }

  /** Adds a managed member and picks a non-default role (Adult / Child / Pet / External). */
  async addManagedMemberWithRole(name: string, roleLabel: string) {
    await this.page.getByRole('button', { name: 'Add member' }).click();

    const dialog = this.page.getByRole('dialog');
    await dialog.getByRole('tab', { name: 'Add without account' }).click();
    await dialog.getByLabel('Name', { exact: true }).fill(name);
    await dialog.getByRole('combobox').click();
    await this.page.getByRole('option', { name: roleLabel }).click();
    await dialog.getByRole('button', { name: 'Add member' }).click();

    await expect(dialog).toBeHidden();
  }

  /** Sends an email invite via the "Add member" dialog's "Invite via email" tab. */
  async inviteViaEmail(email: string) {
    await this.page.getByRole('button', { name: 'Add member' }).click();

    const dialog = this.page.getByRole('dialog');
    await dialog.getByRole('tab', { name: 'Invite via email' }).click();
    await dialog.getByPlaceholder('invitee@email.com').fill(email);
    await dialog.getByRole('button', { name: /Send invite/ }).click();

    await expect(dialog).toBeHidden();
  }

  /** Removes a member via its row action menu (owner-only, no confirm dialog). */
  async removeMember(name: string) {
    const row = this.memberRow(name);
    await row.getByRole('button', { name: 'Open menu' }).click();
    await this.page.getByRole('menuitem', { name: 'Remove member' }).click();
  }

  /** Edits a managed member's name via its row action menu. */
  async editManagedMemberName(currentName: string, newName: string) {
    const row = this.memberRow(currentName);
    await row.getByRole('button', { name: 'Open menu' }).click();
    await this.page.getByRole('menuitem', { name: 'Edit details' }).click();

    const dialog = this.page.getByRole('dialog');
    await dialog.getByLabel('Name', { exact: true }).fill(newName);
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
  }

  /** Invites a managed member to create their own account (sends an email invite). */
  async inviteManagedMemberToAccount(name: string, email: string) {
    const row = this.memberRow(name);
    await row.getByRole('button', { name: 'Open menu' }).click();
    await this.page.getByRole('menuitem', { name: 'Invite to create account' }).click();

    const dialog = this.page.getByRole('dialog');
    await dialog.getByLabel('Email').fill(email);
    await dialog.getByRole('button', { name: 'Send invite' }).click();
    await expect(dialog).toBeHidden();
  }

  /** Changes an account member's role via the in-row Role select (owner-only). */
  async setMemberRole(name: string, roleLabel: string) {
    const row = this.memberRow(name);
    await row.getByRole('combobox').click();
    await this.page.getByRole('option', { name: roleLabel }).click();
  }

  /** Transfers household ownership to the named account member via its row menu. */
  async transferOwnershipTo(name: string) {
    const row = this.memberRow(name);
    await row.getByRole('button', { name: 'Open menu' }).click();
    await this.page.getByRole('menuitem', { name: 'Transfer ownership' }).click();
  }

  /** Revokes a pending invite via its row menu (on the Pending invites tab). */
  async revokeInvite(email: string) {
    const row = this.inviteRow(email);
    await row.getByRole('button', { name: 'Open menu' }).click();
    await this.page.getByRole('menuitem', { name: 'Revoke invite' }).click();
  }
}

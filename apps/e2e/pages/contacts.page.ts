import { expect, type Page } from '@playwright/test';

import { SearchBox } from './search-box';

/** The household address book (`/family/contacts`) and one contact's own page. */
export class ContactsPage {
  private readonly searchBox: SearchBox;

  constructor(private readonly page: Page) {
    this.searchBox = new SearchBox(page, 'Search names, phones and emails');
  }

  async goto() {
    await this.page.goto('/family/contacts');
    await expect(this.page.getByRole('heading', { level: 1, name: 'Contacts' })).toBeVisible();
  }

  row(name: string) {
    return this.page.getByRole('row').filter({ hasText: name });
  }

  /** Every name in the table, top to bottom — for asserting an order rather than a membership. */
  async rowNames() {
    return this.page.getByRole('table').getByRole('link').allTextContents();
  }

  /**
   * Creates a contact. `type` and `birthday` are optional because the birthday field only exists for
   * the types that have one, which is the behaviour a spec wants to be able to pin down.
   */
  async add(name: string, { birthday, phone, type }: { birthday?: string; phone?: string; type?: string } = {}) {
    await this.page.getByRole('button', { name: 'Add contact', exact: true }).first().click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByLabel('Name').fill(name);

    if (type) {
      await this.setType(type);
    }

    if (phone) {
      await dialog.getByLabel('Phone').fill(phone);
    }

    if (birthday) {
      const input = dialog.getByLabel('Birthday (optional)');
      await input.fill(birthday);
      await input.blur();
    }

    await dialog.getByRole('button', { name: 'Create contact' }).click();
    await expect(dialog).toBeHidden();
  }

  /**
   * Changes the type on the dialog that is already open — not a fresh one. The gate it drives is
   * meant to react while the form is still unsaved, so a spec has to be able to move it in place.
   */
  async setType(type: string) {
    const dialog = this.page.getByRole('dialog');
    await dialog.getByLabel('Type').click();
    await this.page.getByRole('option', { name: type, exact: true }).click();
  }

  /** Whether the open dialog is offering a birthday at all — the UI-only family/friend gate. */
  birthdayField() {
    return this.page.getByRole('dialog').getByLabel('Birthday (optional)');
  }

  async openCreateDialog(name?: string) {
    await this.page.getByRole('button', { name: 'Add contact', exact: true }).first().click();
    const dialog = this.page.getByRole('dialog');

    if (name) {
      await dialog.getByLabel('Name').fill(name);
    }

    return dialog;
  }

  async submitCreate() {
    const dialog = this.page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Create contact' }).click();
    await expect(dialog).toBeHidden();
  }

  async closeDialog() {
    await this.page.keyboard.press('Escape');
    await expect(this.page.getByRole('dialog')).toBeHidden();
  }

  async search(term: string) {
    await this.searchBox.fill(term);
  }

  async filterByType(type: string) {
    await this.page.getByRole('combobox', { name: 'Filter by type' }).click();
    await this.page.getByRole('option', { name: type, exact: true }).click();
    await this.page.waitForURL((url) => url.searchParams.has('type'));
  }

  async sortBy(key: string) {
    await this.page.getByRole('combobox', { name: 'Sort by' }).click();
    await this.page.getByRole('option', { name: key, exact: true }).click();
    await this.page.waitForURL((url) => url.searchParams.has('sortKey'));
  }

  /**
   * Opens a contact's own page by clicking the row anywhere *but* its link — the whole row is the
   * target, and the name link is only the keyboard's way in.
   */
  async open(name: string) {
    await expect(this.row(name)).toBeVisible();
    await this.row(name).getByRole('cell').filter({ hasNotText: name }).first().click();
    await expect(this.page.getByRole('heading', { level: 1, name })).toBeVisible();
  }

  /** The same page via the name link, which is what a keyboard or a screen reader would follow. */
  async openViaNameLink(name: string) {
    await expect(this.row(name)).toBeVisible();
    await this.row(name).getByRole('link', { name }).click();
    await expect(this.page.getByRole('heading', { level: 1, name })).toBeVisible();
  }

  /** Adds a relation from inside the open create/edit dialog, where the reverse wording isn't asked for. */
  async addRelationInDialog(relatedName: string, role: string) {
    const dialog = this.page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Add relation', exact: true }).click();
    await this.page.getByPlaceholder('Search contacts').fill(relatedName);
    await this.page.getByRole('option', { name: new RegExp(relatedName) }).click();
    await this.pickInDialog(dialog.getByRole('combobox', { name: `${relatedName}'s relation` }), role);
  }

  /**
   * Records a relation from the open contact's page: pick the other contact, then name both
   * directions. The reverse arrives prefilled, so a spec only overrides it when that is the point.
   */
  async addRelation(relatedName: string, role: string, inverseRole?: string) {
    // The picker's trigger, before any dialog is open — the submit button inside the dialog it opens
    // carries the same words, so every later locator here is scoped to the dialog.
    await this.page.getByRole('button', { name: 'Add relation', exact: true }).click();
    await this.page.getByPlaceholder('Search contacts').fill(relatedName);
    await this.page.getByRole('option', { name: new RegExp(relatedName) }).click();

    const dialog = this.page.getByRole('dialog');
    await this.pickInDialog(dialog.getByRole('combobox').first(), role);

    if (inverseRole) {
      await this.pickInDialog(dialog.getByRole('combobox').nth(1), inverseRole);
    }

    await dialog.getByRole('button', { name: 'Add relation' }).click();
    await expect(dialog).toBeHidden();
  }

  private async pickInDialog(combobox: ReturnType<Page['getByRole']>, option: string) {
    await combobox.click();
    await this.page.getByRole('option', { name: option, exact: true }).click();
  }

  /**
   * Drops a relation through the *edit* dialog rather than the detail card, and saves — the path
   * that has to work out for itself which relations were already stored.
   */
  async removeRelationInEditDialog(relatedName: string) {
    await this.page.getByRole('button', { name: 'Open menu' }).click();
    await this.page.getByRole('menuitem', { name: 'Edit contact' }).click();

    const dialog = this.page.getByRole('dialog');
    await dialog.getByRole('button', { name: `Remove ${relatedName}` }).click();
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toBeHidden();
  }

  /**
   * A relation row on the open contact's page.
   *
   * Scoped to the named list rather than the page's `listitem`s at large: the sidebar is a list, and
   * so is Sonner's toast region — and the toast confirming a removal quotes the very name being
   * asserted gone, so an unscoped `toBeHidden` fails whenever the toast outlives the row.
   */
  relation(relatedName: string) {
    return this.page.getByRole('list', { name: 'Relations' }).getByRole('listitem').filter({ hasText: relatedName });
  }

  /** The role select inside a relation row — a live control that commits on change. */
  async setRelationRole(relatedName: string, role: string) {
    await this.relation(relatedName).getByRole('combobox').click();
    await this.page.getByRole('option', { name: role, exact: true }).click();
  }

  /** Removes a relation from the detail card, through the confirm it now asks for. */
  async removeRelation(relatedName: string) {
    await this.relation(relatedName)
      .getByRole('button', { name: `Remove ${relatedName}` })
      .click();

    const confirm = this.page.getByRole('dialog');
    // The confirm has to say the other contact loses it too — one row is a record shared by both,
    // and nothing on this page would show that happening.
    await expect(confirm).toContainText(`${relatedName}'s page as well`);
    await confirm.getByRole('button', { name: 'Remove relation' }).click();

    await expect(this.relation(relatedName)).toBeHidden();
  }

  /** Deletes from the contact's own page, which navigates back to the list. */
  async deleteFromDetail() {
    await this.page.getByRole('button', { name: 'Open menu' }).click();
    await this.page.getByRole('menuitem', { name: 'Delete contact' }).click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Delete contact' }).click();
    await expect(this.page.getByRole('heading', { level: 1, name: 'Contacts' })).toBeVisible();
  }

  /** Best-effort cleanup: removes the contact when it's in the book, and says so. */
  async deleteIfPresent(name: string) {
    if ((await this.row(name).count()) === 0) {
      return false;
    }

    await this.row(name).getByRole('button', { name: 'Open menu' }).click();
    await this.page.getByRole('menuitem', { name: 'Delete contact' }).click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Delete contact' }).click();
    await expect(dialog).toBeHidden();

    return true;
  }
}

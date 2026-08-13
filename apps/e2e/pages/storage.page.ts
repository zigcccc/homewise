import { expect, type Page } from '@playwright/test';

import { SORT_DIRECTION_NAME } from '../support/text';
import { MapCanvas } from './map';
import { SearchBox } from './search-box';

/** The storage locations list (`/storage/locations`) and one location's detail page. */
export class StorageLocationsPage {
  private readonly searchBox: SearchBox;
  /** Unscoped, so it resolves to the page's own map rather than the create dialog's. */
  readonly overviewMap: MapCanvas;

  constructor(private readonly page: Page) {
    this.searchBox = new SearchBox(page, 'Search locations');
    this.overviewMap = new MapCanvas(page);
  }

  async goto() {
    await this.page.goto('/storage/locations');
    await this.expectOpen();
  }

  async expectOpen() {
    await expect(this.page.getByRole('heading', { level: 1, name: 'Storage locations' })).toBeVisible();
  }

  /** A location's card in the grid. */
  card(name: string) {
    return this.page.getByRole('link').filter({ hasText: name });
  }

  async open(name: string) {
    await this.card(name).click();
    await expect(this.page.getByRole('heading', { level: 1, name })).toBeVisible();
  }

  /** Opens the create dialog and leaves it open. */
  async openAddDialog() {
    await this.page.getByRole('button', { name: 'Add location', exact: true }).first().click();
    const dialog = this.page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    return dialog;
  }

  /**
   * Creates a location. The map pin is deliberately left alone here — `addWithPin` covers it on its
   * own, and every other spec would pay for a tile fetch it never asserts on.
   */
  async add(name: string, address?: string) {
    const dialog = await this.openAddDialog();
    await dialog.getByLabel('Name', { exact: true }).fill(name);

    if (address) {
      await dialog.getByLabel('Address', { exact: true }).fill(address);
    }

    await dialog.getByRole('button', { name: 'Add location', exact: true }).click();
    await expect(dialog).toBeHidden();
  }

  /** Submits the add dialog and leaves it open, for the paths the server refuses. */
  async addExpectingError(name: string) {
    const dialog = await this.openAddDialog();
    await dialog.getByLabel('Name', { exact: true }).fill(name);
    await dialog.getByRole('button', { name: 'Add location', exact: true }).click();

    return dialog;
  }

  /** Drops a pin by clicking the map in the create dialog, then saves. */
  async addWithPin(name: string) {
    const dialog = await this.openAddDialog();
    await dialog.getByLabel('Name', { exact: true }).fill(name);

    await new MapCanvas(this.page, dialog).click();

    // The clear button only exists once there's a pin to clear.
    await expect(dialog.getByRole('button', { name: 'Clear pin' })).toBeVisible();

    await dialog.getByRole('button', { name: 'Add location', exact: true }).click();
    await expect(dialog).toBeHidden();
  }

  async renameFromDetail(from: string, to: string) {
    await this.open(from);
    await this.page.getByRole('button', { name: 'Open menu' }).first().click();
    await this.page.getByRole('menuitem', { name: 'Edit location' }).click();

    const dialog = this.page.getByRole('dialog');
    await dialog.getByLabel('Name', { exact: true }).fill(to);
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toBeHidden();
  }

  /** Opens the delete dialog without confirming, so a spec can read what it warns about. */
  async openDeleteFromDetail(name: string) {
    await this.open(name);
    await this.page.getByRole('button', { name: 'Open menu' }).first().click();
    await this.page.getByRole('menuitem', { name: 'Delete location' }).click();

    return this.page.getByRole('dialog');
  }

  async delete(name: string) {
    const dialog = await this.openDeleteFromDetail(name);
    await dialog.getByRole('button', { name: 'Delete location' }).click();
    await expect(dialog).toBeHidden();
    await this.expectOpen();
  }

  /** Best-effort cleanup: removes the location when it's listed, and says so. */
  async deleteIfPresent(name: string) {
    if ((await this.card(name).count()) === 0) {
      return false;
    }

    await this.delete(name);

    return true;
  }

  async search(term: string) {
    await this.searchBox.fill(term);
  }
}

/** The global item list (`/storage/items`), and the same table as it appears on a location. */
export class StorageItemsPage {
  private readonly searchBox: SearchBox;

  constructor(private readonly page: Page) {
    this.searchBox = new SearchBox(page, 'Search items');
  }

  async goto() {
    await this.page.goto('/storage/items');
    await this.expectOpen();
  }

  async expectOpen() {
    await expect(this.page.getByRole('heading', { level: 1, name: 'Items' })).toBeVisible();
  }

  row(name: string) {
    return this.page.getByRole('row').filter({ hasText: name });
  }

  async add({
    location,
    name,
    notes,
    quantity,
  }: {
    location: string;
    name: string;
    notes?: string;
    quantity?: number;
  }) {
    await this.page.getByRole('button', { name: 'Add item', exact: true }).first().click();
    const dialog = this.page.getByRole('dialog');

    await dialog.getByLabel('Name', { exact: true }).fill(name);

    if (quantity !== undefined) {
      await dialog.getByLabel('How many').fill(String(quantity));
    }

    await dialog.getByLabel('Location').click();
    await this.page.getByRole('option', { name: location, exact: true }).click();

    if (notes) {
      await dialog.getByLabel('Notes').fill(notes);
    }

    await dialog.getByRole('button', { name: 'Add item', exact: true }).click();
    await expect(dialog).toBeHidden();
  }

  /** Submits the add dialog and leaves it open, for the validation path. */
  async addExpectingError(location: string) {
    await this.page.getByRole('button', { name: 'Add item', exact: true }).first().click();
    const dialog = this.page.getByRole('dialog');

    await dialog.getByLabel('Location').click();
    await this.page.getByRole('option', { name: location, exact: true }).click();
    await dialog.getByRole('button', { name: 'Add item', exact: true }).click();

    return dialog;
  }

  /** Renames a row in place: click the name, type, Enter. */
  async renameInline(from: string, to: string) {
    await this.openInlineRename(from, to);
    await this.commitInlineRename();
  }

  /** Opens a row's inline editor and types a new name into it, without committing. */
  async openInlineRename(from: string, to: string) {
    await expect(this.row(from)).toBeVisible();
    // The resting cell is labelled by what it does, not by the value it shows.
    await this.row(from).getByRole('button', { name: 'Edit item name' }).click();
    await expect(this.nameInput()).toBeFocused();
    await this.nameInput().fill(to);
  }

  /**
   * Commits whatever an open inline editor is carrying. Split out for the spec that needs the table
   * to change underneath the editor between opening it and pressing Enter.
   */
  async commitInlineRename() {
    await this.nameInput().press('Enter');
  }

  private nameInput() {
    return this.page.getByRole('table').getByRole('textbox', { name: 'Item name' });
  }

  /** Edits a row's quantity in place — the same click-type-Enter bargain the name cell makes. */
  async setQuantityInline(name: string, quantity: string) {
    await expect(this.row(name)).toBeVisible();
    await this.row(name).getByRole('button', { name: 'Edit quantity' }).click();

    const input = this.page.getByRole('table').getByRole('textbox', { name: 'Quantity' });
    await expect(input).toBeFocused();
    await input.fill(quantity);
    await input.press('Enter');

    return input;
  }

  /**
   * A move as a person makes one: hover the trigger, wait for the submenu, click a location. The
   * keyboard variant below exists for one spec's particular need — it must not be the only coverage,
   * because `ArrowRight` opens a Radix submenu that a pointer cannot reach whenever anything is
   * intercepting hover, and a trigger that is silently `disabled` answers the keyboard no differently
   * than the mouse. Both paths need driving.
   */
  async moveTo(name: string, location: string) {
    await this.openRowMenu(name);

    const trigger = this.page.getByRole('menuitem', { name: 'Move to' });
    await expect(trigger).toBeEnabled();
    await trigger.hover();

    await this.clickSubmenuLocation(location);
  }

  /**
   * The second half of a move, for the spec that needs something to happen to the table between
   * opening the menu and using it.
   *
   * Opened with the keyboard rather than a hover: a Radix submenu opens on pointer-enter, so a
   * pointer-driven open depends on the menu still sitting under the cursor — and a list that another
   * member is adding to moves it. `ArrowRight` is the same affordance, unmoved.
   */
  async moveToFromOpenMenu(location: string) {
    const trigger = this.page.getByRole('menuitem', { name: 'Move to' });
    await trigger.press('ArrowRight');

    await this.clickSubmenuLocation(location);
  }

  private async clickSubmenuLocation(location: string) {
    const submenu = this.page.getByRole('menu').filter({ has: this.page.getByRole('menuitem', { name: location }) });
    await expect(submenu).toBeVisible();
    await submenu.getByRole('menuitem', { name: location, exact: true }).click();
  }

  /** Lends an item to a contact created on the spot, which is the flow that mints one atomically. */
  async lendToNewContact(name: string, borrower: string, dueOn?: string) {
    await this.openRowMenu(name);
    await this.page.getByRole('menuitem', { name: 'Lend it out' }).click();

    const lendDialog = this.page.getByRole('dialog').filter({ hasText: 'Lend' });
    await lendDialog.getByRole('button', { name: 'Who has it' }).click();
    // A `ComboboxAction`, not an option — it opens a dialog rather than picking a value.
    await this.page.getByRole('button', { name: 'Create new contact' }).click();

    const contactDialog = this.page.getByRole('dialog').filter({ hasText: 'Create contact' });
    await contactDialog.getByLabel('Name', { exact: true }).fill(borrower);
    await contactDialog.getByRole('button', { name: 'Create contact', exact: true }).click();
    await expect(contactDialog).toBeHidden();

    if (dueOn) {
      await lendDialog.getByLabel('Due back').fill(dueOn);
    }

    await lendDialog.getByRole('button', { name: 'Lend it out' }).click();
    await expect(lendDialog).toBeHidden();
  }

  async markReturned(name: string) {
    await this.openRowMenu(name);
    await this.page.getByRole('menuitem', { name: 'Mark returned' }).click();
  }

  async delete(name: string) {
    await this.openRowMenu(name);
    await this.page.getByRole('menuitem', { name: 'Delete item' }).click();

    const dialog = this.page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Delete item' }).click();
    await expect(dialog).toBeHidden();
  }

  /** Best-effort cleanup: removes the item when it's listed, and says so. */
  async deleteIfPresent(name: string) {
    if ((await this.row(name).count()) === 0) {
      return false;
    }

    await this.delete(name);

    return true;
  }

  async search(term: string) {
    await this.searchBox.fill(term);
  }

  /** Narrows by loan state. The select has no visible label, so it carries an `aria-label` instead. */
  async filterByStatus(status: string) {
    await this.page.getByRole('combobox', { name: 'Filter by status' }).click();
    await this.page.getByRole('option', { name: status, exact: true }).click();
  }

  async selectSortKey(label: string) {
    await this.page.getByRole('combobox', { name: 'Sort by' }).click();
    await this.page.getByRole('option', { name: label, exact: true }).click();
  }

  /** The sort-direction toggle. Its label follows the sort column, so match any of the four. */
  sortDirectionButton() {
    return this.page.getByRole('button', { name: SORT_DIRECTION_NAME });
  }

  async openRowMenu(name: string) {
    // Settle on the row before reaching into it, so the click can't land mid-rerender.
    await expect(this.row(name)).toBeVisible();
    await this.row(name).getByRole('button', { name: 'Open menu' }).click();
    await expect(this.page.getByRole('menuitem', { name: 'Move to' })).toBeVisible();
  }
}

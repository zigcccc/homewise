import { ContactsPage } from '../pages/contacts.page';
import { expect, test } from '../support/test';

test.describe('contacts', () => {
  // Every spec is self-contained: it creates uniquely-named data and removes it, so it's
  // idempotent across reruns and never mutates the shared seed fixtures.

  test('adds, searches, filters and deletes a contact', async ({ page }) => {
    const contacts = new ContactsPage(page);
    await contacts.goto();

    const name = `E2E Contact ${Date.now()}`;

    try {
      await contacts.add(name, { birthday: '20. 06. 1985', phone: '+386 40 000 111', type: 'Friend' });
      await expect(contacts.row(name)).toBeVisible();
      await expect(contacts.row(name)).toContainText('Friend');
      await expect(contacts.row(name)).toContainText('20. 06. 1985');

      // Search narrows to this row; the seeded borrower drops out.
      await contacts.search(name);
      await expect(contacts.row(name)).toBeVisible();
      await expect(page.getByRole('row')).toHaveCount(2); // header + the one match
      await contacts.search('');

      // The type filter is a different axis, and this contact is not medical.
      await contacts.filterByType('Medical');
      await expect(contacts.row(name)).toBeHidden();
    } finally {
      await contacts.goto();
      expect(await contacts.deleteIfPresent(name)).toBe(true);
    }
  });

  test('offers a birthday for family and friends, and not for a business contact', async ({ page }) => {
    const contacts = new ContactsPage(page);
    await contacts.goto();

    // GIVEN: the create dialog, set to a type that keeps a birthday
    await contacts.openCreateDialog();
    await contacts.setType('Family');
    await expect(contacts.birthdayField()).toBeVisible();

    // WHEN: the type is changed to one that doesn't, in the same unsaved dialog
    await contacts.setType('Business');

    // THEN: the field should go away — a dentist has no birthday worth chasing
    await expect(contacts.birthdayField()).toBeHidden();

    // AND BACK: the gate is a display rule, not a one-way door
    await contacts.setType('Friend');
    await expect(contacts.birthdayField()).toBeVisible();

    await contacts.closeDialog();
  });

  test('relates two contacts, and each sees the other from its own side', async ({ page }) => {
    const contacts = new ContactsPage(page);
    await contacts.goto();

    const stamp = Date.now();
    const sarah = `E2E Sarah ${stamp}`;
    const john = `E2E John ${stamp}`;

    try {
      await contacts.add(sarah, { type: 'Family' });
      await contacts.add(john, { type: 'Friend' });

      // GIVEN: Sarah's page, reached by clicking the row rather than the name link — the whole row
      // is the target, which is how anyone actually opens one
      await contacts.open(sarah);

      // WHEN: John is recorded as her husband
      await contacts.addRelation(john, 'Husband', 'Wife');

      // THEN: her page should read "John — Husband". Whose relations these are is the card's job to
      // say, so the row itself is just the other person and the role.
      await expect(contacts.relation(john)).toContainText('Husband');

      // THEN: and John's page should read the *same row* the other way round. This is the whole
      // design: one stored relation, turned to face whichever contact is being looked at.
      await contacts.goto();
      await contacts.open(john);
      await expect(contacts.relation(sarah)).toContainText('Wife');

      // WHEN: the role is corrected from John's side — his frame, which is the stored inverse
      await contacts.setRelationRole(sarah, 'Partner');
      await expect(contacts.relation(sarah)).toContainText('Partner');

      // THEN: Sarah's own side should be untouched, the two directions being separate wordings
      await contacts.goto();
      await contacts.open(sarah);
      await expect(contacts.relation(john)).toContainText('Husband');

      // WHEN: the relation is removed from Sarah's side
      await contacts.removeRelation(john);

      // THEN: it should be gone from John's page too — there was only ever one row
      await contacts.goto();
      await contacts.open(john);
      await expect(contacts.relation(sarah)).toBeHidden();

      // WHEN: John is deleted from his own page. The page navigates away before refreshing the
      // cache, so a spec that stayed put would land on the 404 its own delete had just created.
      await contacts.deleteFromDetail();
      await expect(contacts.row(john)).toBeHidden();
    } finally {
      await contacts.goto();
      await contacts.deleteIfPresent(sarah);
      await contacts.deleteIfPresent(john);
    }
  });

  test('records a relation while the contact is being created, and lets the edit dialog drop it', async ({ page }) => {
    const contacts = new ContactsPage(page);
    await contacts.goto();

    const stamp = Date.now();
    const existing = `E2E Ana ${stamp}`;
    const created = `E2E Bojan ${stamp}`;

    try {
      await contacts.add(existing, { type: 'Family' });

      // WHEN: a second contact is created with the relation named in the same dialog. It can only
      // ride along with the create — there is no contact id to hang it off until the row exists.
      await contacts.openCreateDialog(created);
      await contacts.setType('Family');
      await contacts.addRelationInDialog(existing, 'Brother');
      await contacts.submitCreate();

      // THEN: it should be stored with the contact, and read the other way round from Ana's page
      await contacts.open(created);
      await expect(contacts.relation(existing)).toContainText('Brother');

      await contacts.goto();
      await contacts.open(existing);
      await expect(contacts.relation(created)).toContainText('Sibling');

      // WHEN: the same relation is dropped in the edit dialog and saved
      await contacts.removeRelationInEditDialog(created);

      // THEN: it should be gone from both — the dialog reconciles against what was stored, so a
      // relation Ana never entered herself is still hers to remove
      await expect(contacts.relation(created)).toBeHidden();
      await contacts.goto();
      await contacts.open(created);
      await expect(contacts.relation(existing)).toBeHidden();
    } finally {
      await contacts.goto();
      await contacts.deleteIfPresent(existing);
      await contacts.deleteIfPresent(created);
    }
  });

  test('sorts by whose birthday is next rather than by the stored date', async ({ page }) => {
    const contacts = new ContactsPage(page);
    await contacts.goto();

    // Letter-prefixed, not a bare timestamp: the router JSON-encodes a search value that would
    // otherwise parse as a number, so `?search=1786444856615` reaches the URL as `"1786444856615"`
    // — quotes and all — and nothing typed would ever match it again.
    const tag = `bday${Date.now()}`;
    // Both born in the same year, so a plain date sort would put January first. The next birthday
    // to come round is what the column actually means, and the two disagree for most of the year.
    const january = `E2E Jan ${tag}`;
    const december = `E2E Dec ${tag}`;

    try {
      await contacts.add(january, { birthday: '05. 01. 1990', type: 'Friend' });
      await contacts.add(december, { birthday: '31. 12. 1990', type: 'Friend' });

      // The shared tag narrows to exactly these two rows, so a contact another worker is creating at
      // the same time can't wander into the order being asserted.
      await contacts.search(tag);
      await contacts.sortBy('Birthday');

      // Settle on both rows before reading an order off the table. `sortBy` only waits for the URL,
      // which changes before the refetch it triggers comes back — reading straight after can catch
      // the list mid-render and see neither row.
      await expect(contacts.row(january)).toBeVisible();
      await expect(contacts.row(december)).toBeVisible();

      const names = await contacts.rowNames();
      const januaryAt = names.indexOf(january);
      const decemberAt = names.indexOf(december);
      expect(januaryAt).toBeGreaterThanOrEqual(0);
      expect(decemberAt).toBeGreaterThanOrEqual(0);

      // Today decides which comes first, and the assertion has to agree with the calendar rather
      // than hard-code an order that would start failing on 1 January.
      const today = new Date();
      const monthDay = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      if (monthDay <= '01-05') {
        // Both still to come this year: the earlier date leads.
        expect(januaryAt).toBeLessThan(decemberAt);
      } else {
        // January has been and gone, so it wraps past December into next year.
        expect(decemberAt).toBeLessThan(januaryAt);
      }
    } finally {
      await contacts.goto();
      await contacts.deleteIfPresent(january);
      await contacts.deleteIfPresent(december);
    }
  });

  test('refuses a contact with no name', async ({ page }) => {
    const contacts = new ContactsPage(page);
    await contacts.goto();

    await page.getByRole('button', { name: 'Add contact', exact: true }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Create contact' }).click();

    await expect(dialog).toContainText('Name must contain at least 1 character');
    await expect(dialog).toBeVisible();

    await contacts.closeDialog();
  });

  test('puts the search term back in the box when you come back to the list', async ({ page }) => {
    const contacts = new ContactsPage(page);
    const name = `E2E Search ${Date.now()}`;

    await contacts.goto();

    try {
      await contacts.add(name);

      // Narrowed twice, as anyone retyping a search does.
      await contacts.search('E2E Search');
      await contacts.search(name);

      await contacts.open(name);
      await page.goBack();
      await expect(page.getByRole('heading', { level: 1, name: 'Contacts' })).toBeVisible();

      // A box fed by `defaultValue` comes back empty over a filtered list, which reads as a list
      // that lost half its contacts.
      await expect(contacts.searchValue()).toHaveValue(name);

      // Each committed search replaces the last, so Back leaves the list rather than walking
      // backwards through the word a letter at a time.
      await page.goBack();
      await expect(page).not.toHaveURL(/search=E2E\+Search$/);
    } finally {
      await contacts.goto();
      await contacts.search(name);
      await contacts.deleteIfPresent(name);
    }
  });
});

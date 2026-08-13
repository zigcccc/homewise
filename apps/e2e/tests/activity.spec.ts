import { expect, test } from '@playwright/test';

import { SEED_ACTIVITY, SEED_USER } from '@homewise/server/seed-fixtures';

import { ActivityPage } from '../pages/activity.page';
import { ContactsPage } from '../pages/contacts.page';
import { DashboardPage } from '../pages/dashboard.page';
import { ShoppingListsPage } from '../pages/shopping-lists.page';

/**
 * The activity feed is the one view every other spec writes into — each worker's contacts, expenses
 * and lists all land here. So nothing below asserts on position, ordering or count: each case
 * creates a uniquely-named row, filters the feed down to it, and asks only whether its line exists.
 *
 * That is also what makes the feature worth testing here rather than by unit test: the thing under
 * test is that a change made through the real UI reaches the log at all, having passed through
 * `withHousehold`'s emit buffer on the way.
 */

test.describe('activity log', () => {
  test('records a change made through the UI, and names who made it', async ({ page }) => {
    const name = `E2E Activity ${Date.now()}`;
    const contacts = new ContactsPage(page);
    const activity = new ActivityPage(page);

    try {
      // GIVEN: a contact created through the address book
      await contacts.goto();
      await contacts.add(name);

      // WHEN: the feed is filtered down to it
      await activity.goto();
      const entry = await activity.find(name);

      // THEN: the line should say who did what, and to which thing
      await expect(entry).toBeVisible();
      await expect(entry).toContainText(SEED_USER.name);
      await expect(entry).toContainText('added the contact');
    } finally {
      await contacts.goto();
      await contacts.deleteIfPresent(name);
    }
  });

  test('keeps the line after the thing itself is gone', async ({ page }) => {
    const name = `E2E Activity Gone ${Date.now()}`;
    const contacts = new ContactsPage(page);
    const activity = new ActivityPage(page);

    // GIVEN: a contact that is created and then deleted
    await contacts.goto();
    await contacts.add(name);
    await contacts.deleteIfPresent(name);

    // WHEN: the feed is filtered to that name
    await activity.goto();
    const entry = await activity.find(name);

    // THEN: the removal should still be readable — the case timestamps and an `updatedBy` column
    // cannot cover, since the row that held the name no longer exists
    await expect(entry).toBeVisible();
    await expect(entry).toContainText('removed the contact');
  });

  test('links a line back to the thing it is about', async ({ page }) => {
    const name = `E2E Activity Link ${Date.now()}`;
    const contacts = new ContactsPage(page);
    const activity = new ActivityPage(page);

    try {
      // GIVEN: a contact that still exists
      await contacts.goto();
      await contacts.add(name);

      // WHEN: its line is found in the feed and followed
      await activity.goto();
      const entry = await activity.find(name);
      await entry.getByRole('link', { name }).click();

      // THEN: it should land on that contact's own page
      await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    } finally {
      await contacts.goto();
      await contacts.deleteIfPresent(name);
    }
  });

  test('stays quiet about shopping-list items', async ({ page }) => {
    const itemName = `E2E Quiet Item ${Date.now()}`;
    const lists = new ShoppingListsPage(page);
    const activity = new ActivityPage(page);
    let listId: string | undefined;

    try {
      // GIVEN: a uniquely-named item added to a list
      await lists.goto();
      listId = await lists.createList();
      await lists.addOneOff(itemName);

      // WHEN: the feed is searched for it
      await activity.goto();
      await activity.find(itemName);

      // THEN: there should be no line at all — a shop is dozens of ticks, and logging each would
      // bury everything else the household did that day
      await expect(activity.entry(itemName)).toHaveCount(0);
      await expect(activity.empty()).toBeVisible();
    } finally {
      if (listId) {
        await lists.deleteListViaApi(listId);
      }
    }
  });

  test('narrows the feed by kind', async ({ page }) => {
    const name = `E2E Activity Kind ${Date.now()}`;
    const contacts = new ContactsPage(page);
    const activity = new ActivityPage(page);

    try {
      // GIVEN: a contact whose creation is in the feed
      await contacts.goto();
      await contacts.add(name);
      await activity.goto();

      // WHEN: the feed is narrowed to contacts
      await activity.filterByKind('Contacts');

      // THEN: the line should survive the filter
      await expect(await activity.find(name)).toBeVisible();

      // WHEN: it is narrowed to a kind this change isn't
      await activity.filterByKind('Recipes');

      // THEN: it should be filtered out
      await expect(activity.entry(name)).toHaveCount(0);
    } finally {
      await contacts.goto();
      await contacts.deleteIfPresent(name);
    }
  });

  test('says which field a change moved, and what it moved between', async ({ page }) => {
    const name = `E2E Activity Diff ${Date.now()}`;
    const contacts = new ContactsPage(page);
    const activity = new ActivityPage(page);

    try {
      // GIVEN: a contact whose phone number is then edited through the real form
      await contacts.goto();
      await contacts.add(name, { phone: '041 234 567' });
      await contacts.open(name);
      await contacts.editField('Phone', '041 765 432');

      // WHEN: the feed is filtered down to it
      await activity.goto();
      const entry = await activity.find(name);

      // THEN: the line should answer "what changed" without anyone having to go and look
      await expect(entry).toContainText('updated the contact');
      await expect(entry.getByTestId('activity-changes')).toContainText('Phone: 041 234 567 → 041 765 432');
    } finally {
      await contacts.goto();
      await contacts.deleteIfPresent(name);
    }
  });

  test('stays quiet about a save that changed nothing', async ({ page }) => {
    const name = `E2E Activity Noop ${Date.now()}`;
    const contacts = new ContactsPage(page);
    const activity = new ActivityPage(page);

    try {
      // GIVEN: a contact whose edit form is opened and saved with nothing touched
      await contacts.goto();
      await contacts.add(name);
      await contacts.open(name);
      await contacts.editField('Name', name);

      // WHEN: the feed is filtered to that name
      await activity.goto();
      await activity.find(name);

      // THEN: only its creation should be there — opening a form and pressing Save is not history
      await expect(activity.entry(name)).toHaveCount(1);
      await expect(activity.entry(name)).toContainText('added the contact');
    } finally {
      await contacts.goto();
      await contacts.deleteIfPresent(name);
    }
  });

  test('reads a run of edits as one line, not the same sentence repeated', async ({ page }) => {
    const activity = new ActivityPage(page);
    const run = SEED_ACTIVITY.find((entry) => entry.count > 1);

    if (!run) {
      throw new Error('the seed must carry a folded activity run for this spec to have anything to read');
    }

    // GIVEN: a seeded line standing for several edits to one recipe — seeded rather than driven,
    // because folding turns on what the *previous* write was, and every worker writes here
    await activity.goto();
    await activity.find(run.label);

    // THEN: it should say how many times it happened, instead of appearing once per edit
    await expect(activity.entry(run.label).filter({ hasText: `made ${run.count} updates to` })).toBeVisible();
  });

  test('is reachable from the sidebar', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    const activity = new ActivityPage(page);

    await dashboard.goto();
    await activity.openFromSidebar();
  });

  test('groups the feed under day headings', async ({ page }) => {
    const activity = new ActivityPage(page);
    await activity.goto();

    // The seed writes entries spanning today, yesterday and earlier, so at least one heading is
    // always present however many rows the parallel workers have added on top.
    await expect.poll(() => activity.dayHeadings()).toContain('Today');
  });
});

test.describe('activity on the dashboard', () => {
  test('shows the card, and points it at the full feed', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.activity()).toBeVisible();
    await expect(dashboard.activity().getByRole('link', { name: 'View all' })).toHaveAttribute(
      'href',
      '/manage/activity'
    );
  });
});

import { expect, test } from '@playwright/test';

import { SEED_HOUSEHOLD_NAME, SEED_SECOND_USER, SEED_USER } from '@homewise/server/seed-fixtures';

import { HouseholdMembersPage } from '../pages/household-members.page';
import { IngredientsPage } from '../pages/ingredients.page';
import { OnboardingPage } from '../pages/onboarding.page';
import { SettingsPage } from '../pages/settings.page';
import { ShoppingListsPage } from '../pages/shopping-lists.page';
import { UserProfilePage } from '../pages/user-profile.page';
import { deleteHouseholdIfPresent } from '../support/households';
import { ONBOARDING_STORAGE_STATE, SECOND_USER_STORAGE_STATE } from '../support/paths';

/**
 * The specs that mutate a **shared seed row** the rest of the suite observes:
 *   - the household name (the dashboard/auth specs assert it),
 *   - the seed user's name (ditto),
 *   - household ownership (member removal, role changes, and every profile
 *     teardown are owner-only, so briefly de-owning the seed user would break
 *     anything running alongside it), and
 *   - the onboarding user's household, which `onboarding.spec.ts` also owns.
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
    // Restore the seed member's role AND assert it inside finally, so a restore
    // that fails or only partially applies is detected even when the try block threw.
    await members.setMemberRole(SEED_SECOND_USER.name, 'Adult');
    await expect(roleSelect).toContainText('Adult');
  }
});

test('keeps one household’s realtime changes out of another household', async ({ page, browser }) => {
  // Three tabs. The insider is the control: it proves the event was actually broadcast, which is
  // what makes the outsider's silence evidence of isolation rather than of a slow round trip.
  // Lives here rather than in the parallel project because it takes over the onboarding user's
  // household, which `onboarding.spec.ts` also owns.
  test.slow();

  const stamp = Date.now();
  const name = `E2E Isolation ${stamp}`;

  const actor = new IngredientsPage(page);

  const insiderContext = await browser.newContext({ storageState: SECOND_USER_STORAGE_STATE });
  const insider = new IngredientsPage(await insiderContext.newPage());

  const outsiderContext = await browser.newContext({ storageState: ONBOARDING_STORAGE_STATE });
  const outsiderPage = await outsiderContext.newPage();
  const outsider = new IngredientsPage(outsiderPage);

  try {
    // Give the outsider a household of their own, so they're a fully-fledged realtime subscriber —
    // just on a different channel.
    await deleteHouseholdIfPresent(outsiderPage);
    const onboarding = new OnboardingPage(outsiderPage);
    await onboarding.start();
    await onboarding.createHousehold(`E2E Isolation Household ${stamp}`);
    await onboarding.skipInvites();

    await outsider.goto();
    await insider.goto();
    await actor.goto();

    // Positive control for the outsider. Without it, their silence below could just as well mean
    // their realtime never worked at all (a refused token, a channel they never attached to) — this
    // pins it to "connected, listening, and correctly not hearing the other household".
    const ownName = `E2E Isolation Own ${stamp}`;
    const outsiderSecondPage = await outsiderContext.newPage();
    const outsiderActor = new IngredientsPage(outsiderSecondPage);
    await outsiderActor.goto();
    await outsiderActor.add(ownName);
    await expect(outsider.row(ownName)).toBeVisible();
    await outsiderSecondPage.close();

    await actor.add(name);

    // Delivered to the household it was addressed to…
    await expect(insider.row(name)).toBeVisible();
    // …and to nobody else. The row would also be absent because the outsider's *database* scope
    // excludes it, so this is belt and braces — but a leaked event would show up as a refetch
    // storm here long before it showed up as leaked data.
    await expect(outsider.row(name)).toHaveCount(0);
  } finally {
    try {
      await actor.goto();
      await actor.deleteIfPresent(name);
      await deleteHouseholdIfPresent(outsiderPage);
    } finally {
      await insiderContext.close();
      await outsiderContext.close();
    }
  }
});

test('keeps realtime working after the household changes without a page load', async ({ browser }) => {
  // The Ably client is scoped to the tab and never closed, so it outlives the household it was
  // authorized for: its token names one channel, and a household swap moves the tab to another.
  // Every path here after the first household exists is client-side routing, so the tab carries
  // that stale token into the new household — which is exactly the state a reload would hide.
  //
  // Exclusive, like the isolation spec above, because it takes over the onboarding user's household.
  test.slow();

  const stamp = Date.now();
  const context = await browser.newContext({ storageState: ONBOARDING_STORAGE_STATE });
  const page = await context.newPage();
  const onboarding = new OnboardingPage(page);

  try {
    await deleteHouseholdIfPresent(page);
    await onboarding.start();
    await onboarding.createHousehold(`E2E Rekey First ${stamp}`);
    await onboarding.skipInvites();

    // Landing on the dashboard is what constructs the client and gets it a token for the *first*
    // household's channel. `deleteHouseholdIfPresent` then reloads once — still under that
    // household — and everything from its delete onwards is routing, not navigation.
    await deleteHouseholdIfPresent(page);
    await onboarding.createHousehold(`E2E Rekey Second ${stamp}`);
    await onboarding.skipInvites();

    const observer = new IngredientsPage(page);
    await observer.openFromSidebar();

    // A second tab acts in the new household. If the observer never re-authorized, its attach was
    // refused with 40160 — a channel Ably does not retry — and this row never arrives.
    const name = `E2E Rekey ${stamp}`;
    const actorPage = await context.newPage();
    const actor = new IngredientsPage(actorPage);
    await actor.goto();
    await actor.add(name);

    await expect(observer.row(name)).toBeVisible();
  } finally {
    // The ingredient belongs to the household being deleted, so it goes with it.
    try {
      await deleteHouseholdIfPresent(page);
    } finally {
      await context.close();
    }
  }
});

/**
 * The two shopping-list behaviours that need the household to hold **no other lists** — a
 * whole-household precondition no self-contained spec can create, since the parallel project has
 * several specs minting lists at once. The seed creates none, and every parallel spec deletes the
 * ones it made, so by the time this project runs the household is empty.
 *
 * Both matter: the empty state is the only thing on screen at that point, and deleting the last
 * list is the case where a stale cache used to leave the deleted list rendered in the detail pane.
 */
test('shows the empty state with no lists, and returns to it when the last one is deleted', async ({ page }) => {
  const lists = new ShoppingListsPage(page);

  // Establish the precondition rather than assume it: the parallel specs each clean up after
  // themselves, but one of them failing shouldn't turn into a second, misleading failure here.
  await lists.deleteAllLists();

  await expect(page.getByText('No shopping lists yet')).toBeVisible();
  // No second column to fill when there is nothing to put beside it.
  await expect(lists.masterColumn()).toHaveCount(0);

  const listId = await lists.createList();
  await expect(lists.listLink(listId)).toBeVisible();

  await lists.deleteList();

  // The detail pane has to go with it. It used to survive: the index route auto-selected the first
  // list it could see, and the cache still held the one just deleted.
  await expect(page).not.toHaveURL(new RegExp(`/food/shopping-lists/${listId}$`));
  await expect(page.getByRole('button', { name: 'List actions' })).toHaveCount(0);
  await expect(page.getByText('No shopping lists yet')).toBeVisible();
});

/**
 * Ensures the seed user is the owner again. If the forward transfer succeeded but
 * the restore didn't, the second member is still owner and can hand it back; if
 * ownership never moved, the second member isn't owner and this is a no-op.
 */
async function restoreSeedOwner(secondMembers: HouseholdMembersPage) {
  await secondMembers.goto();
  // goto() only waits for the page chrome (the "Add member" button), not the
  // members list — so wait for the second member's row to load before the
  // point-in-time ownership check, or a still-loading row yields a false "not
  // owner" and skips the restore.
  const secondRow = secondMembers.memberRow(SEED_SECOND_USER.name);
  await expect(secondRow).toBeVisible();
  // isVisible() returns false for an absent "(owner)" marker without throwing, so
  // no catch is needed here — a genuine navigation/UI error should propagate rather
  // than be silently swallowed into "not owner" (which would skip the restore).
  const secondIsOwner = await secondRow.getByText('(owner)').isVisible();

  if (secondIsOwner) {
    await secondMembers.transferOwnershipTo(SEED_USER.name);
    await expect(secondMembers.memberRow(SEED_USER.name)).toContainText('(owner)');
  }
}

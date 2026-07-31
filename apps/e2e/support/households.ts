import { expect, type Page } from '@playwright/test';

import { SettingsPage } from '../pages/settings.page';

/**
 * Leaves the given user without a household. If `/` renders the dashboard a household exists (from
 * a prior test or a crashed run) and is deleted via the settings danger zone; otherwise the user is
 * already household-less.
 *
 * Shared by the specs that drive the household-less onboarding user, since creating a household is
 * a one-way transition and each of them has to own that user's state end-to-end.
 */
export async function deleteHouseholdIfPresent(page: Page) {
  await page.goto('/');

  const createButton = page.getByRole('button', { name: 'Create', exact: true });
  const householdHeading = page.getByRole('heading', { name: /Your household:/ });
  await expect(createButton.or(householdHeading)).toBeVisible();

  // Household-less users are redirected to create-household — nothing to clean up.
  if (await createButton.isVisible()) {
    return;
  }

  const settings = new SettingsPage(page);
  await settings.goto();
  const name = await settings.nameInput.inputValue();

  const dialog = await settings.openDeleteDialog();
  await dialog.getByLabel('Household name').fill(name);
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.waitForURL(/\/onboarding\/create-household/);
  // The confirm dialog has a "Household name" field of its own and outlives the redirect by its
  // close animation, so whatever runs next sees two of them. Leave the page settled instead.
  await expect(dialog).toBeHidden();
}

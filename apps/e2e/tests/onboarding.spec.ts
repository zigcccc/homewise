import { expect, type Page, test } from '@playwright/test';

import { SEED_ONBOARDING_USER } from '@homewise/server/seed-fixtures';

import { OnboardingPage } from '../pages/onboarding.page';
import { SettingsPage } from '../pages/settings.page';
import { ONBOARDING_STORAGE_STATE } from '../support/paths';

test.describe('onboarding', () => {
  // Runs as the dedicated household-less user. Creating a household is a one-way
  // transition, so this spec owns that user's state end-to-end: it clears any
  // leftover household before and after, so reruns always start from a clean slate.
  test.use({ storageState: ONBOARDING_STORAGE_STATE });

  test.beforeEach(async ({ page }) => {
    await deleteHouseholdIfPresent(page);
  });

  test('creates a household from onboarding and lands on the dashboard', async ({ page }) => {
    const onboarding = new OnboardingPage(page);
    const householdName = `E2E Onboarding ${Date.now()}`;

    await onboarding.start();
    await onboarding.createHousehold(householdName);
    await onboarding.skipInvites();

    await expect(page.getByRole('heading', { name: `Hello ${SEED_ONBOARDING_USER.name}!` })).toBeVisible();
    await expect(page.getByRole('heading', { name: `Your household: ${householdName}` })).toBeVisible();

    await deleteHouseholdIfPresent(page);
  });
});

/**
 * Leaves the onboarding user without a household. If `/` renders the dashboard a
 * household exists (from this test or a crashed prior run) and is deleted via the
 * settings danger zone; otherwise the user is already household-less.
 */
async function deleteHouseholdIfPresent(page: Page) {
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
}

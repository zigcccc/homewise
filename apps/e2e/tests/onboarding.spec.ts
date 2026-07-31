import { expect, test } from '@playwright/test';

import { SEED_ONBOARDING_USER } from '@homewise/server/seed-fixtures';

import { OnboardingPage } from '../pages/onboarding.page';
import { deleteHouseholdIfPresent } from '../support/households';
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

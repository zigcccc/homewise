import { SEED_ONBOARDING_USER } from '@homewise/server/seed-fixtures';

import { DashboardPage } from '../pages/dashboard.page';
import { OnboardingPage } from '../pages/onboarding.page';
import { deleteHouseholdIfPresent } from '../support/households';
import { test } from '../support/test';

test.describe('onboarding', () => {
  // Runs as this worker's household-less user. Creating a household is a one-way
  // transition, so this spec owns that user's state end-to-end: it clears any
  // leftover household before and after, so reruns always start from a clean slate.
  test.use({ sessionAs: 'onboarding' });

  test.beforeEach(async ({ page }) => {
    await deleteHouseholdIfPresent(page);
  });

  test('creates a household from onboarding and lands on the dashboard', async ({ page }) => {
    const onboarding = new OnboardingPage(page);
    const householdName = `E2E Onboarding ${Date.now()}`;

    await onboarding.start();
    await onboarding.createHousehold(householdName);
    await onboarding.skipInvites();

    await new DashboardPage(page).expectLoaded({ householdName, userName: SEED_ONBOARDING_USER.name });

    await deleteHouseholdIfPresent(page);
  });
});

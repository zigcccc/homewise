import { test as setup } from '@playwright/test';

import { SEED_ONBOARDING_USER, SEED_SECOND_USER, SEED_USER } from '@homewise/server/seed-fixtures';

import { DashboardPage } from '../pages/dashboard.page';
import { LoginPage } from '../pages/login.page';
import { ONBOARDING_STORAGE_STATE, SECOND_USER_STORAGE_STATE, STORAGE_STATE } from '../support/paths';

/**
 * Authenticates each seeded user once and persists its session to a per-user
 * storageState. The `parallel` and `exclusive` projects depend on this `setup`
 * project; most specs reuse the seed-user session (`STORAGE_STATE`), while a few
 * opt into the second-member or onboarding sessions via `test.use({ storageState })`.
 */

setup('authenticate seed user', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(SEED_USER.email, SEED_USER.password);

  // Confirm we're actually authenticated before persisting the session.
  await new DashboardPage(page).expectLoaded();

  await page.context().storageState({ path: STORAGE_STATE });
});

setup('authenticate second member', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  // A member of the seed household, so they also land on the dashboard (`/`).
  await login.login(SEED_SECOND_USER.email, SEED_SECOND_USER.password);

  await page.context().storageState({ path: SECOND_USER_STORAGE_STATE });
});

setup('authenticate onboarding user', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  // No household yet, so the onboarded guard redirects into the onboarding flow
  // rather than the dashboard.
  await login.fillCredentials(SEED_ONBOARDING_USER.email, SEED_ONBOARDING_USER.password);
  await page.waitForURL(/\/onboarding/, { timeout: 15_000 });

  await page.context().storageState({ path: ONBOARDING_STORAGE_STATE });
});

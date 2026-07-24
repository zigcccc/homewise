import { test as setup } from '@playwright/test';

import { SEED_USER } from '@homewise/server/seed-fixtures';

import { DashboardPage } from '../pages/dashboard.page';
import { LoginPage } from '../pages/login.page';
import { STORAGE_STATE } from '../support/paths';

/**
 * Authenticates the seeded user once and persists the session to STORAGE_STATE.
 * The `chromium` project depends on this and loads that state, so individual
 * tests start already signed in (no per-test login).
 */
setup('authenticate seed user', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(SEED_USER.email, SEED_USER.password);

  // Confirm we're actually authenticated before persisting the session.
  await new DashboardPage(page).expectLoaded();

  await page.context().storageState({ path: STORAGE_STATE });
});

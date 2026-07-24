import { test } from '@playwright/test';

import { SEED_USER } from '@homewise/server/seed-fixtures';

import { DashboardPage } from '../pages/dashboard.page';
import { LoginPage } from '../pages/login.page';

test.describe('authentication', () => {
  // Start signed out (ignore the shared authenticated storageState) so this
  // exercises the real login UI end-to-end, not just the saved session.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('logs in with the seed user and lands on the dashboard', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(SEED_USER.email, SEED_USER.password);

    await new DashboardPage(page).expectLoaded();
  });
});

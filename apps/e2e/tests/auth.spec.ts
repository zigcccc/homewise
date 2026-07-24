import { expect, test } from '@playwright/test';

import { SEED_USER } from '@homewise/server/seed-fixtures';

import { AppNav } from '../pages/app-nav.page';
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

test.describe('sign out', () => {
  // Log in fresh (own session) rather than reusing the shared storageState —
  // signing out invalidates the session token server-side, which would break
  // every other spec that reuses the same saved seed-user session.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('signs out from the sidebar account menu and returns to login', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(SEED_USER.email, SEED_USER.password);
    await new DashboardPage(page).expectLoaded();

    await new AppNav(page).signOut();

    await expect(page).toHaveURL(/\/login/);
  });
});

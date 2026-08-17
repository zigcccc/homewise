import { AppNav } from '../pages/app-nav.page';
import { DashboardPage } from '../pages/dashboard.page';
import { LoginPage } from '../pages/login.page';
import { expect, test } from '../support/test';

test.describe('authentication', () => {
  // Start signed out so this exercises the real login UI end-to-end, not the saved session every
  // other spec starts behind.
  test.use({ sessionAs: 'none' });

  test('logs in with the seed user and lands on the dashboard', async ({ household, page }) => {
    const { user } = household.accounts;
    const login = new LoginPage(page);
    await login.goto();
    await login.login(user.email, user.password);

    await new DashboardPage(page).expectLoaded();
  });
});

test.describe('sign out', () => {
  // Log in fresh rather than reusing this worker's saved session — signing out invalidates the
  // session token server-side, which would break every later spec on the same worker.
  test.use({ sessionAs: 'none' });

  test('signs out from the sidebar account menu and returns to login', async ({ household, page }) => {
    const { user } = household.accounts;
    const login = new LoginPage(page);
    await login.goto();
    await login.login(user.email, user.password);
    await new DashboardPage(page).expectLoaded();

    await new AppNav(page).signOut();

    await expect(page).toHaveURL(/\/login/);
  });
});

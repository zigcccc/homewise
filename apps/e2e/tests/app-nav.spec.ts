import { AppNav } from '../pages/app-nav.page';
import { DashboardPage } from '../pages/dashboard.page';
import { expect, test } from '../support/test';

test.describe('sidebar navigation', () => {
  test('renders every entry as a link, with nothing interactive inside it', async ({ page }) => {
    const nav = new AppNav(page);

    await new DashboardPage(page).goto();

    // `SidebarMenuButton` renders its own `<button>` unless composed with `asChild`, which put a
    // button inside every nav anchor.
    await expect(nav.nestedButtons()).toHaveCount(0);
  });

  test('lights the entry for the route being viewed', async ({ page }) => {
    const nav = new AppNav(page);

    await page.goto('/family/kids');
    await expect(nav.navLink('Kids')).toHaveAttribute('data-active', 'true');
    await expect(nav.navLink('Pets')).not.toHaveAttribute('data-active', 'true');

    await page.goto('/food/shopping-lists');
    await expect(nav.navLink('Shopping lists')).toHaveAttribute('data-active', 'true');
    await expect(nav.navLink('Kids')).not.toHaveAttribute('data-active', 'true');
  });

  test('keeps the section lit on a route nested under it', async ({ page }) => {
    const nav = new AppNav(page);

    await page.goto('/food/ingredients/stores');

    await expect(nav.navLink('Ingredients')).toHaveAttribute('data-active', 'true');
  });

  test('lights Dashboard on the dashboard and nowhere else', async ({ page }) => {
    const nav = new AppNav(page);

    await new DashboardPage(page).goto();
    await expect(nav.navLink('Dashboard')).toHaveAttribute('data-active', 'true');

    // Every route is nested under `/`, so Dashboard is the one entry that has to match exactly.
    await page.goto('/family/kids');
    await expect(nav.navLink('Dashboard')).not.toHaveAttribute('data-active', 'true');
  });
});

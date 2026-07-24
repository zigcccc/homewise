import { expect, test } from '@playwright/test';

import { SEED_HOUSEHOLD_NAME } from '@homewise/server/seed-fixtures';

import { SettingsPage } from '../pages/settings.page';

// The household-rename spec lives in serial-seed-mutations.spec.ts (it mutates a
// shared seed row). This delete-gating check is read-only, so it runs in parallel.
test.describe('household settings', () => {
  test('gates household deletion behind a name-match confirmation', async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();

    const dialog = await settings.openDeleteDialog();
    const confirmDelete = dialog.getByRole('button', { name: 'Delete', exact: true });
    const nameConfirmation = dialog.getByLabel('Household name');

    // Disabled until the typed name exactly matches the household name.
    await expect(confirmDelete).toBeDisabled();
    await nameConfirmation.fill('not the household name');
    await expect(confirmDelete).toBeDisabled();
    await nameConfirmation.fill(SEED_HOUSEHOLD_NAME);
    await expect(confirmDelete).toBeEnabled();

    // Never actually delete the shared seed household — close without confirming.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(settings.heading(SEED_HOUSEHOLD_NAME)).toBeVisible();
  });
});

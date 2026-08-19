import { SEED_CHILD_DOCTOR, SEED_CHILD_MEMBER, SEED_CHILD_PROFILE, SEED_RECIPE } from '@homewise/server/seed-fixtures';

import { AppNav } from '../pages/app-nav.page';
import { ExternalHomePage } from '../pages/external-home.page';
import { KidsPage } from '../pages/kids.page';
import { expect, test } from '../support/test';

/**
 * The grandparent case: a member who is family but has nothing to do with running the household.
 *
 * What she can reach is the point of the role — a recipe the child likes, and the child's profile
 * with the doctor's number on it — so this asserts the reaching as hard as the refusing. A spec that
 * only checked for absences would pass just as well against a blank page.
 */
test.describe('external member', () => {
  test.use({ sessionAs: 'external' });

  test('lands on its own home rather than the dashboard', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/\/external/);
    await new ExternalHomePage(page).expectLoaded();
  });

  test('is offered only the sections it can open', async ({ page }) => {
    await new ExternalHomePage(page).goto();
    const nav = new AppNav(page);

    await expect(nav.navLink('Kids')).toBeVisible();
    await expect(nav.navLink('Pets')).toBeVisible();
    await expect(nav.navLink('Recipes')).toBeVisible();

    for (const hidden of ['Contacts', 'Monthly expenses', 'Shopping lists', 'Household members', 'Settings']) {
      await expect(nav.navLink(hidden)).toHaveCount(0);
    }
  });

  test('is sent home from a section it cannot read', async ({ page }) => {
    await page.goto('/expenses/monthly-expenses');

    await expect(page).toHaveURL(/\/external/);
  });

  test('can read a recipe but not change one', async ({ page }) => {
    await page.goto('/food/recipes');

    await expect(page.getByText(SEED_RECIPE.title).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'New recipe' })).toHaveCount(0);

    await page.getByText(SEED_RECIPE.title).first().click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(SEED_RECIPE.title);
    // The header's edit affordance and its actions menu are the whole write surface here.
    await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Recipe actions' })).toHaveCount(0);
  });

  test('reads a kid profile, doctor and all, without an editable control', async ({ page }) => {
    await page.goto('/family/kids');
    await expect(page.getByText(SEED_CHILD_MEMBER.nickname)).toBeVisible();

    await page.getByText(SEED_CHILD_MEMBER.nickname).first().click();
    await expect(page).toHaveURL(/\/family\/kids\/\d+/);

    // The medical card is what the role exists for, so it must be on screen and readable — the
    // doctor's name and phone number are the handoff this whole role is about.
    await expect(page.getByText(SEED_CHILD_DOCTOR.name)).toBeVisible();
    await expect(page.getByText(SEED_CHILD_DOCTOR.phone)).toBeVisible();
    // The masked identifiers stay revealed: the pencil that unmasks them is a button, and the
    // disabled fieldset would otherwise take it away along with everything else.
    const kids = new KidsPage(page);
    await expect(kids.identifierInput('nationalId')).toHaveValue(SEED_CHILD_PROFILE.nationalId);
    await expect(kids.identifierInput('nationalId')).toBeDisabled();
    // Nothing here offers a way to add or unlink a contact.
    await expect(page.getByRole('button', { name: 'Add contact' })).toHaveCount(0);
    // …and none of it editable. The save only renders once a field is dirty, which cannot happen.
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Profile actions' })).toHaveCount(0);
  });

  test('never asks for a realtime token', async ({ page }) => {
    const tokenRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/realtime/')) {
        tokenRequests.push(request.url());
      }
    });

    await new ExternalHomePage(page).goto();
    await page.goto('/food/recipes');
    await expect(page.getByText(SEED_RECIPE.title).first()).toBeVisible();

    // One channel per household, and every event carries the name of what changed — including things
    // this member may not read. Not subscribing is the fix, so this is the assertion that guards it.
    expect(tokenRequests).toEqual([]);
  });
});

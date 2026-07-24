import { type Page } from '@playwright/test';

import { HouseholdMembersPage } from '../pages/household-members.page';
import { KidsPage } from '../pages/kids.page';
import { PetsPage } from '../pages/pets.page';

/**
 * Setup/teardown helpers shared by the profile specs (dictionary, medical, pets).
 * They drive the real UI — add a managed member, then create its profile from the
 * Kids/Pets suggestion — so a spec can focus on the behaviour it actually covers.
 * Removing the member cascade-deletes the profile and everything under it.
 */

/** Adds a managed child member and creates its profile; leaves you on the General tab. */
export async function createChildProfile(page: Page, name: string) {
  const members = new HouseholdMembersPage(page);
  await members.goto();
  await members.addManagedMember(name); // defaults to the Child role

  const kids = new KidsPage(page);
  await kids.goto();
  await kids.createProfileFor(name);
}

/** Adds a managed pet member and creates its profile; leaves you on the General tab. */
export async function createPetProfile(page: Page, name: string) {
  const members = new HouseholdMembersPage(page);
  await members.goto();
  await members.addManagedMemberWithRole(name, 'Pet');

  const pets = new PetsPage(page);
  await pets.goto();
  await pets.createProfileFor(name);
}

/** Removes a managed member (cascade-deletes any profile), used as teardown. */
export async function removeManagedMember(page: Page, name: string) {
  const members = new HouseholdMembersPage(page);
  await members.goto();
  await members.removeMember(name);
}

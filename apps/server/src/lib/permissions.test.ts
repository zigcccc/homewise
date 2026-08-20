import { describe, expect, it } from 'vitest';

import { householdMemberRole } from '#modules/households/households.model';

import { accessForMethod, can, PERMISSION_AREAS, type PermissionAccess } from './permissions';

const ACCESSES: PermissionAccess[] = ['read', 'write'];

describe('can', () => {
  /**
   * The whole grid in one assertion. A new role or a new area moves this snapshot, so neither can be
   * added without someone reading what it granted — which is the review the `Record` type can't force.
   */
  it('should grant exactly this much', () => {
    const grid = householdMemberRole.options.map((role) => [
      role,
      Object.fromEntries(
        ACCESSES.map((access) => [access, PERMISSION_AREAS.filter((area) => can(role, area, access))])
      ),
    ]);

    expect(Object.fromEntries(grid)).toMatchInlineSnapshot(`
      {
        "adult": {
          "read": [
            "household",
            "householdMembers",
            "childProfiles",
            "childDictionaries",
            "petProfiles",
            "medicalInfo",
            "contacts",
            "recipes",
            "ingredients",
            "stores",
            "mealPlan",
            "shoppingLists",
            "expenses",
            "expenseCategories",
            "storageLocations",
            "storageItems",
            "realtime",
            "activity",
          ],
          "write": [
            "household",
            "householdMembers",
            "childProfiles",
            "childDictionaries",
            "petProfiles",
            "medicalInfo",
            "contacts",
            "recipes",
            "ingredients",
            "stores",
            "mealPlan",
            "shoppingLists",
            "expenses",
            "expenseCategories",
            "storageLocations",
            "storageItems",
            "realtime",
            "activity",
          ],
        },
        "child": {
          "read": [
            "household",
            "householdMembers",
            "childProfiles",
            "childDictionaries",
            "petProfiles",
            "medicalInfo",
            "contacts",
            "recipes",
            "ingredients",
            "stores",
            "mealPlan",
            "shoppingLists",
            "expenses",
            "expenseCategories",
            "storageLocations",
            "storageItems",
            "realtime",
            "activity",
          ],
          "write": [],
        },
        "external": {
          "read": [
            "household",
            "childProfiles",
            "childDictionaries",
            "petProfiles",
            "recipes",
            "realtime",
          ],
          "write": [],
        },
        "pet": {
          "read": [],
          "write": [],
        },
      }
    `);
  });

  it('should refuse every write for a child', () => {
    // GIVEN: a child, who reads the whole household
    // THEN: no area anywhere should be writable
    expect(PERMISSION_AREAS.filter((area) => can('child', area, 'read'))).toEqual([...PERMISSION_AREAS]);
    expect(PERMISSION_AREAS.filter((area) => can('child', area, 'write'))).toEqual([]);
  });

  it('should refuse everything for a pet', () => {
    // A pet is never an account holder; this is the backstop behind the invite guards.
    for (const access of ACCESSES) {
      expect(PERMISSION_AREAS.filter((area) => can('pet', area, access))).toEqual([]);
    }
  });

  it('should give an external the handoff areas and nothing else', () => {
    // `medicalInfo` is deliberately absent: it has no GET routes at all, and the doctor an external
    // came for arrives embedded in the child profile response — so reading it needs no grant.
    // `realtime` is present, and is what puts her on the `guest` channel rather than no channel.
    // GIVEN: a grandparent, who needs a recipe and a kid's doctor and no more than that
    expect(PERMISSION_AREAS.filter((area) => can('external', area, 'read'))).toEqual([
      'household',
      'childProfiles',
      'childDictionaries',
      'petProfiles',
      'recipes',
      'realtime',
    ]);
    expect(PERMISSION_AREAS.filter((area) => can('external', area, 'write'))).toEqual([]);
  });

  it('should let an adult do anything', () => {
    for (const access of ACCESSES) {
      expect(PERMISSION_AREAS.filter((area) => can('adult', area, access))).toEqual([...PERMISSION_AREAS]);
    }
  });
});

describe('accessForMethod', () => {
  it.each([
    ['GET', 'read'],
    ['HEAD', 'read'],
    ['POST', 'write'],
    ['PATCH', 'write'],
    ['PUT', 'write'],
    ['DELETE', 'write'],
  ])('should read %s as a %s', (method, expected) => {
    expect(accessForMethod(method)).toBe(expected);
  });
});

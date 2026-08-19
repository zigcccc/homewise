import { type HouseholdMemberRole } from '#modules/households/households.model';

/**
 * One capability per mounted sub-app, so a route app declares exactly one and the mount is trivially
 * correct. Adding a feature module adds one entry here and one argument to its `withHousehold`.
 */
export const PERMISSION_AREAS = [
  'household',
  'householdMembers',
  'childProfiles',
  'childDictionaries',
  'petProfiles',
  'medicalInfo',
  'contacts',
  'recipes',
  'ingredients',
  'stores',
  'mealPlan',
  'shoppingLists',
  'expenses',
  'expenseCategories',
  'storageLocations',
  'storageItems',
  'realtime',
  'activity',
] as const;

export type PermissionArea = (typeof PERMISSION_AREAS)[number];
export type PermissionAccess = 'read' | 'write';

/** `'all'` is a value, not shorthand: a new area is granted to whoever holds it and denied to everyone else. */
type AreaGrant = 'all' | readonly PermissionArea[];
type RolePolicy = { read: AreaGrant; write: AreaGrant };

/**
 * What each role may do. The `Record` is load-bearing: the roles come from the DB enum via
 * drizzle-zod, so adding one to the schema is a compile error here and nowhere else.
 *
 * Annotated rather than `as const satisfies` on purpose — `as const` narrows each array to its own
 * literal tuple, and `grant.includes(area)` then stops compiling for want of a cast.
 */
export const ROLE_POLICIES: Record<HouseholdMemberRole, RolePolicy> = {
  adult: { read: 'all', write: 'all' },
  child: { read: 'all', write: [] },
  // A grandparent, holding what you would otherwise have to tell whoever is minding your child.
  external: { read: ['household', 'recipes', 'childProfiles', 'childDictionaries', 'petProfiles'], write: [] },
  pet: { read: [], write: [] },
};

export function can(role: HouseholdMemberRole, area: PermissionArea, access: PermissionAccess) {
  const grant = ROLE_POLICIES[role][access];

  return grant === 'all' || grant.includes(area);
}

const READ_METHODS = new Set(['GET', 'HEAD']);

/**
 * Which half of a policy a request is asking for. This is what lets one mount cover a whole sub-app:
 * there is no per-route override list, and the two routes that misfit were reshaped instead.
 */
export const accessForMethod = (method: string): PermissionAccess => (READ_METHODS.has(method) ? 'read' : 'write');

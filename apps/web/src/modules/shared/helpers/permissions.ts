import { redirect } from '@tanstack/react-router';

import { type HouseholdMemberRole } from '@homewise/server/households';
import { can, type PermissionAccess, type PermissionArea } from '@homewise/server/permissions';

/** `can`, tolerant of a role that hasn't loaded yet — which denies, rather than flashing a control. */
export function canRole(role: HouseholdMemberRole | undefined, area: PermissionArea, access: PermissionAccess) {
  return role !== undefined && can(role, area, access);
}

/**
 * Bounces a member who may not write `area`. For a route that only exists to write — a create form,
 * an edit form, an import — since those have nothing to read and so no entry in `NAV_GROUPS`.
 *
 * Called from inside `beforeLoad` rather than being one, so a route that needs to do something else
 * there can. Forgetting it on a new one costs a 403 and the route's error component, never access.
 */
export function requireWrite(role: HouseholdMemberRole, area: PermissionArea) {
  if (!can(role, area, 'write')) {
    throw redirect({ to: '/' });
  }
}

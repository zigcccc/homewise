import { useQuery } from '@tanstack/react-query';

import { type PermissionAccess, type PermissionArea } from '@homewise/server/permissions';

import { getMyHouseholdQueryOptions } from '@/modules/households';

import { canRole } from '../helpers/permissions';

/**
 * The current member's role, or `undefined` until the household query has answered.
 *
 * For code that asks about several areas at once — the sidebar, the quick actions — where a hook per
 * area is not an option. Everything else wants {@link useCan}.
 */
export function useHouseholdRole() {
  return useQuery({ ...getMyHouseholdQueryOptions(), select: (household) => household.viewer.role }).data;
}

/**
 * Whether the current member may `read` or `write` an area — the same policy the server enforces.
 *
 * Reads the household query rather than route context: `beforeLoad` results are cached per match, so
 * a role changed in another tab would leave every button on screen until the next navigation. It also
 * works in a component that renders outside the shell, where there is no route context to read.
 */
export function useCan(area: PermissionArea, access: PermissionAccess) {
  const role = useHouseholdRole();

  return canRole(role, area, access);
}

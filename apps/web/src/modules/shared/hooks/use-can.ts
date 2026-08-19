import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';

import { can, type PermissionAccess, type PermissionArea } from '@homewise/server/permissions';

import { getMyHouseholdQueryOptions } from '@/modules/households';

/**
 * What the current member may do.
 *
 * **Defaults to `'write'`**, because inside the app shell that is the only question worth asking —
 * every role that gets this far reads everything it can reach, so a component asking about an area is
 * asking whether it may change it.
 *
 * Reads the household query rather than route context on purpose: `beforeLoad` results are cached per
 * match, so a role changed in another tab — which arrives here as a realtime invalidation of
 * `['households']` — would leave every button on screen until the next navigation. It also means this
 * is safe to call from a component that renders outside the shell, where there is no route context to
 * read; it denies until the household is known, which is the right way round.
 */
export function useCan() {
  const role = useQuery(getMyHouseholdQueryOptions()).data?.viewer.role;

  return useCallback(
    (area: PermissionArea, access: PermissionAccess = 'write') => role !== undefined && can(role, area, access),
    [role]
  );
}

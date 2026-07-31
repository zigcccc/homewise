import { type QueryClient, queryOptions } from '@tanstack/react-query';

import { client, parseResponse } from '@/api/client';

export function listChildProfilesQueryOptions() {
  return queryOptions({
    queryKey: ['child-profiles', 'list'],
    queryFn: async () => parseResponse(client['child-profiles'].$get()),
  });
}

export function getChildProfileQueryOptions(id: number) {
  return queryOptions({
    queryKey: ['child-profiles', id],
    queryFn: async () => parseResponse(client['child-profiles'][':id'].$get({ param: { id: id.toString() } })),
  });
}

/**
 * Refreshes every child-profile query — the list and any open detail. For changes that reach
 * profiles without naming one, e.g. a contact or medical record being unlinked.
 */
export function invalidateChildProfiles(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ['child-profiles'] });
}

/** Refreshes the profile list (cards) and a single profile's detail (its `entryCount` lives here). */
export function invalidateChildProfile(queryClient: QueryClient, id: number) {
  void queryClient.invalidateQueries({ queryKey: ['child-profiles', 'list'], exact: true });
  void queryClient.invalidateQueries({ queryKey: ['child-profiles', id] });
}

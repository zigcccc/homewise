import { type QueryClient, queryOptions } from '@tanstack/react-query';

import { client, parseResponse } from '@/api/client';

export function listPetProfilesQueryOptions() {
  return queryOptions({
    queryKey: ['pet-profiles', 'list'],
    queryFn: async () => parseResponse(client['pet-profiles'].$get()),
  });
}

export function getPetProfileQueryOptions(id: number) {
  return queryOptions({
    queryKey: ['pet-profiles', id],
    queryFn: async () => parseResponse(client['pet-profiles'][':id'].$get({ param: { id: id.toString() } })),
  });
}

/** Refreshes the profile list (cards) and a single profile's detail. */
export function invalidatePetProfile(queryClient: QueryClient, id: number) {
  void queryClient.invalidateQueries({ queryKey: ['pet-profiles', 'list'], exact: true });
  void queryClient.invalidateQueries({ queryKey: ['pet-profiles', id] });
}

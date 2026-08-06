import { type QueryClient, queryOptions } from '@tanstack/react-query';
import { type InferRequestType, type InferResponseType } from 'hono';

import { client, parseResponse } from '@/api/client';

const $listStorageLocations = client['storage-locations'].$get;
const $readStorageLocation = client['storage-locations'][':id'].$get;
const $createStorageLocation = client['storage-locations'].$post;
const $patchStorageLocation = client['storage-locations'][':id'].$patch;
const $deleteStorageLocation = client['storage-locations'][':id'].$delete;

export type ListStorageLocationsQuery = InferRequestType<typeof $listStorageLocations>['query'];

/** A place, as the list returns it: what it holds and how much of that is lent out. */
export type StorageLocation = InferResponseType<typeof $listStorageLocations, 200>[number];

export { $createStorageLocation, $deleteStorageLocation, $patchStorageLocation };

/**
 * The household's storage locations. Each search/sort combination caches separately, so the filtered
 * listing and the unfiltered set the "Move to…" menu reads don't evict each other.
 */
export function listStorageLocationsQueryOptions(query: ListStorageLocationsQuery = {}) {
  return queryOptions({
    queryKey: ['storage-locations', 'list', query],
    queryFn: async () => parseResponse($listStorageLocations({ query })),
  });
}

export function getStorageLocationQueryOptions(id: number) {
  return queryOptions({
    queryKey: ['storage-locations', id],
    queryFn: async () => parseResponse($readStorageLocation({ param: { id: id.toString() } })),
  });
}

/**
 * Every location query. Creating, renaming or moving anything can reorder or re-filter any list
 * variant and shift the counts on a detail, so the whole prefix goes rather than a single key.
 */
export function invalidateStorageLocations(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ['storage-locations'] });
}

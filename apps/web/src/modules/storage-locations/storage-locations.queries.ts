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

/** A location as a picker shows one: what it's called, and nothing that moves. */
export type StorageLocationOption = Pick<StorageLocation, 'id' | 'name'>;

/**
 * Strips a location down to what a picker renders.
 *
 * The counts are the point of removing them. Every item written anywhere in the household moves an
 * `itemCount`, which invalidates this list and hands back a new array — so anything reading the full
 * location re-renders on a number it never shows. Projected down to id and name, an unchanged set of
 * locations survives that refetch as the **same** value (TanStack applies structural sharing to a
 * `select` result), and nothing downstream so much as re-renders.
 *
 * That matters more than it sounds: `DataTable` renders cells through `flexRender`, which treats a
 * column's `cell` function as a component *type* — so a column array rebuilt from changing data
 * remounts every cell in the table, closing whatever menu or inline editor was open in one.
 */
export const toLocationOptions = (locations: StorageLocation[]): StorageLocationOption[] =>
  locations.map(({ id, name }) => ({ id, name }));

/** The household's locations, for a picker. Shares its cache entry with the full list above. */
export function listStorageLocationOptionsQueryOptions() {
  return queryOptions({ ...listStorageLocationsQueryOptions(), select: toLocationOptions });
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

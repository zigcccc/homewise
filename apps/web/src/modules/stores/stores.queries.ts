import { type QueryClient, queryOptions } from '@tanstack/react-query';
import { type InferRequestType, type InferResponseType } from 'hono';

import { client, parseResponse } from '@/api/client';

const $listStores = client.stores.$get;
const $createStore = client.stores.$post;
const $patchStore = client.stores[':id'].$patch;
const $deleteStore = client.stores[':id'].$delete;

export type ListStoresQuery = InferRequestType<typeof $listStores>['query'];

/** A shop as the list endpoint returns it, including how many ingredients default to it. */
export type Store = InferResponseType<typeof $listStores, 200>[number];

export type PatchStorePayload = InferRequestType<typeof $patchStore>['json'];

export { $createStore, $deleteStore, $patchStore };

/**
 * The household's shops. Each search/sort combination caches separately, so the filtered listing
 * page and the unfiltered picker the ingredient table opens don't evict each other.
 */
export function listStoresQueryOptions(query: ListStoresQuery = {}) {
  return queryOptions({
    queryKey: ['stores', 'list', query],
    queryFn: async () => parseResponse($listStores({ query })),
  });
}

/**
 * Every shop list variant. Creating or renaming one can reorder or re-filter any of them, so the
 * whole prefix goes rather than a single key.
 */
export function invalidateStores(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ['stores'] });
}

/**
 * Swaps an updated shop into every cached list variant, so an inline rename shows its new value
 * without waiting for a refetch. Pair it with `invalidateStores`: this fixes the cell, the refetch
 * fixes ordering and filtering.
 */
export function applyStoreUpdate(queryClient: QueryClient, updated: Store) {
  queryClient.setQueriesData<Store[]>({ queryKey: ['stores', 'list'] }, (stores) =>
    stores?.map((store) => (store.id === updated.id ? updated : store))
  );
}

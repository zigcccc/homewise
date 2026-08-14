import { infiniteQueryOptions, type QueryClient, queryOptions } from '@tanstack/react-query';
import { type InferRequestType, type InferResponseType } from 'hono';

import { MAX_PAGE_SIZE } from '@homewise/server/models';

import { client, parseResponse } from '@/api/client';
import {
  flattenOptionPages,
  nextPageParam,
  OPTIONS_PAGE_SIZE,
  OPTIONS_STALE_TIME,
  type PageParam,
} from '@/modules/shared';

const $listStores = client.stores.$get;
const $createStore = client.stores.$post;
const $patchStore = client.stores[':id'].$patch;
const $deleteStore = client.stores[':id'].$delete;

export type ListStoresQuery = InferRequestType<typeof $listStores>['query'];

/** A shop as the list endpoint returns it, including how many ingredients default to it. */
export type StoresPage = InferResponseType<typeof $listStores, 200>;
export type Store = StoresPage['items'][number];

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

/** Every shop as one array, for the plain `Select` filter — which has nowhere to put a sentinel. */
export function listStoreOptionsQueryOptions() {
  return queryOptions({
    ...listStoresQueryOptions({ pageSize: MAX_PAGE_SIZE }),
    select: (page: StoresPage) => page.items,
  });
}

/**
 * Shops as a picker reads them. Its own `'options'` prefix, not a `'list'` variant: `applyStoreUpdate`
 * maps over `page.items` and would silently corrupt an `InfiniteData`.
 */
export function listStoreOptionsInfiniteQueryOptions(search?: string) {
  return infiniteQueryOptions({
    queryKey: ['stores', 'options', { search }],
    queryFn: async ({ pageParam }) =>
      parseResponse($listStores({ query: { search, pageSize: OPTIONS_PAGE_SIZE, ...pageParam } })),
    initialPageParam: { page: 1 } as PageParam,
    // No anchor: this list only moves on a create or rename, so offset drift is cheap here.
    getNextPageParam: nextPageParam,
    select: flattenOptionPages,
    staleTime: OPTIONS_STALE_TIME,
  });
}

/**
 * Swaps an updated shop into every cached list variant, so an inline rename shows its new value
 * without waiting for a refetch. Pair it with `invalidateStores`: this fixes the cell, the refetch
 * fixes ordering and filtering.
 */
export function applyStoreUpdate(queryClient: QueryClient, updated: Store) {
  queryClient.setQueriesData<StoresPage>({ queryKey: ['stores', 'list'] }, (page) =>
    page ? { ...page, items: page.items.map((store) => (store.id === updated.id ? updated : store)) } : page
  );
}

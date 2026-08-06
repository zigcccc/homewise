import { type QueryClient, queryOptions } from '@tanstack/react-query';
import { type InferRequestType, type InferResponseType } from 'hono';

import { client, parseResponse } from '@/api/client';

const $listStorageItems = client['storage-items'].$get;
const $createStorageItem = client['storage-items'].$post;
const $patchStorageItem = client['storage-items'][':id'].$patch;
const $deleteStorageItem = client['storage-items'][':id'].$delete;
const $lendStorageItem = client['storage-items'][':id'].loan.$post;
const $returnStorageItem = client['storage-items'][':id'].loan.$delete;

export type ListStorageItemsQuery = InferRequestType<typeof $listStorageItems>['query'];

/** One stored thing, with where it is and — when it's out — who has it. */
export type StorageItem = InferResponseType<typeof $listStorageItems, 200>[number];

export type PatchStorageItemPayload = InferRequestType<typeof $patchStorageItem>['form'];
export type LendStorageItemPayload = InferRequestType<typeof $lendStorageItem>['json'];

export { $createStorageItem, $deleteStorageItem, $lendStorageItem, $patchStorageItem, $returnStorageItem };

/**
 * Everything in storage, or one location's worth of it. The whole query object is in the key, so the
 * global table and each location's tab cache independently rather than overwriting each other.
 */
export function listStorageItemsQueryOptions(query: ListStorageItemsQuery = {}) {
  return queryOptions({
    queryKey: ['storage-items', 'list', query],
    queryFn: async () => parseResponse($listStorageItems({ query })),
  });
}

/**
 * Every item list variant. Any write can move a row between locations, loan states and sort
 * positions all at once, so there is no single variant worth sparing.
 */
export function invalidateStorageItems(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ['storage-items'] });
}

/**
 * Swaps an updated item into every cached list, so an inline rename shows its new value without
 * waiting for a refetch. Pair it with `invalidateStorageItems`: this fixes the cell, the refetch
 * fixes ordering and filtering — and drops the row from lists it no longer belongs in.
 */
export function applyStorageItemUpdate(queryClient: QueryClient, updated: StorageItem) {
  queryClient.setQueriesData<StorageItem[]>({ queryKey: ['storage-items', 'list'] }, (items) =>
    items?.map((item) => (item.id === updated.id ? updated : item))
  );
}

import { type QueryClient, queryOptions } from '@tanstack/react-query';
import { type InferRequestType, type InferResponseType } from 'hono';

import { client, parseResponse } from '@/api/client';

const $listLists = client['shopping-lists'].$get;
const $readList = client['shopping-lists'][':id'].$get;
const $createList = client['shopping-lists'].$post;
const $patchList = client['shopping-lists'][':id'].$patch;
const $deleteList = client['shopping-lists'][':id'].$delete;
const $completeList = client['shopping-lists'][':id'].complete.$post;
const $reopenList = client['shopping-lists'][':id'].reopen.$post;
const $createSection = client['shopping-lists'][':id'].sections.$post;
const $patchSection = client['shopping-lists'][':id'].sections[':sectionId'].$patch;
const $deleteSection = client['shopping-lists'][':id'].sections[':sectionId'].$delete;
const $createItem = client['shopping-lists'][':id'].items.$post;
const $patchItem = client['shopping-lists'][':id'].items[':itemId'].$patch;
const $deleteItem = client['shopping-lists'][':id'].items[':itemId'].$delete;

export {
  $completeList,
  $createItem,
  $createList,
  $createSection,
  $deleteItem,
  $deleteList,
  $deleteSection,
  $patchItem,
  $patchList,
  $patchSection,
  $reopenList,
};

/** A list as the master column shows it: label, completion, and the "3 of 12" counts. */
export type ShoppingListSummary = InferResponseType<typeof $listLists, 200>[number];
export type ShoppingListDetail = InferResponseType<typeof $readList, 200>;
type ShoppingListSection = ShoppingListDetail['sections'][number];
export type ShoppingListItem = ShoppingListDetail['items'][number];

export type PatchItemPayload = InferRequestType<typeof $patchItem>['json'];
export type CreateItemPayload = InferRequestType<typeof $createItem>['json'];

/**
 * One section with its items attached.
 *
 * The server sends sections and items side by side rather than nested — nesting arrays that deep is
 * what once collapsed the meal-plan response to `any` — so this is where they're stitched back
 * together for rendering. `null` is the ungrouped bucket, which sorts last: a heading you chose
 * should come before the odds and ends that haven't found one.
 */
export type SectionWithItems = { items: ShoppingListItem[]; section: ShoppingListSection | null };

export function toSectionsWithItems(detail: ShoppingListDetail): SectionWithItems[] {
  const bySection = new Map<number | null, ShoppingListItem[]>();

  for (const item of detail.items) {
    const forSection = bySection.get(item.sectionId) ?? [];
    forSection.push(item);
    bySection.set(item.sectionId, forSection);
  }

  const grouped: SectionWithItems[] = detail.sections.map((section) => ({
    items: bySection.get(section.id) ?? [],
    section,
  }));

  const ungrouped = bySection.get(null) ?? [];

  return ungrouped.length > 0 ? [...grouped, { items: ungrouped, section: null }] : grouped;
}

/** How many of a list's items are still in the shop rather than the basket. */
export function remainingCount(list: ShoppingListSummary) {
  return list.itemCount - list.checkedCount;
}

export function listShoppingListsQueryOptions(query: InferRequestType<typeof $listLists>['query'] = {}) {
  return queryOptions({
    queryKey: ['shopping-lists', 'list', query],
    queryFn: async () => parseResponse($listLists({ query })),
  });
}

export function getShoppingListQueryOptions(listId: number) {
  return queryOptions({
    queryKey: ['shopping-lists', listId],
    queryFn: async () => parseResponse($readList({ param: { id: listId.toString() } })),
  });
}

/**
 * Every list query at once. Nearly any write moves both halves — ticking an item changes the detail
 * *and* the master column's count, completing one moves it out of the default listing — so the
 * whole prefix goes rather than a single key.
 */
export function invalidateShoppingLists(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ['shopping-lists'] });
}

/**
 * Swaps a written list into its cached detail. Every mutation returns the whole list, because one
 * write routinely moves more than the row it names — adding an item can mint a section, deleting a
 * section re-homes its items — so this keeps the open list correct without waiting for the refetch.
 * Pair it with `invalidateShoppingLists`, which fixes the counts in the master column.
 */
export function applyShoppingListDetail(queryClient: QueryClient, detail: ShoppingListDetail) {
  queryClient.setQueryData(['shopping-lists', detail.id], detail);
}

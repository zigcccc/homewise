import { type QueryClient, queryOptions } from '@tanstack/react-query';
import { type InferRequestType, type InferResponseType } from 'hono';

import { client, parseResponse } from '@/api/client';

const $listExpenseCategories = client['expense-categories'].$get;
const $createExpenseCategory = client['expense-categories'].$post;
const $patchExpenseCategory = client['expense-categories'][':id'].$patch;
const $deleteExpenseCategory = client['expense-categories'][':id'].$delete;

export type ListExpenseCategoriesQuery = InferRequestType<typeof $listExpenseCategories>['query'];

/** A category as the list endpoint returns it, including how many expenses are filed under it. */
export type ExpenseCategory = InferResponseType<typeof $listExpenseCategories, 200>[number];

export { $createExpenseCategory, $deleteExpenseCategory, $patchExpenseCategory };

/**
 * The household's expense categories. Each search/sort combination caches separately, so the sheet's
 * listing and the unfiltered picker every table row opens don't evict each other.
 */
export function listExpenseCategoriesQueryOptions(query: ListExpenseCategoriesQuery = {}) {
  return queryOptions({
    queryKey: ['expense-categories', 'list', query],
    queryFn: async () => parseResponse($listExpenseCategories({ query })),
  });
}

/**
 * Every category list variant. Creating or renaming one can reorder or re-filter any of them, so the
 * whole prefix goes rather than a single key.
 */
export function invalidateExpenseCategories(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
}

/**
 * Swaps an updated category into every cached list variant, so an inline rename in the sheet shows
 * its new value without waiting for a refetch. Pair it with `invalidateExpenseCategories`: this fixes
 * the row, the refetch fixes ordering.
 */
export function applyExpenseCategoryUpdate(queryClient: QueryClient, updated: ExpenseCategory) {
  queryClient.setQueriesData<ExpenseCategory[]>({ queryKey: ['expense-categories', 'list'] }, (categories) =>
    categories?.map((category) => (category.id === updated.id ? updated : category))
  );
}

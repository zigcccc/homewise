import { infiniteQueryOptions, type QueryClient, queryOptions } from '@tanstack/react-query';
import { type InferRequestType, type InferResponseType } from 'hono';

import { MAX_PAGE_SIZE } from '@homewise/server/models';

import { client, parseResponse } from '@/api/client';
import { flattenOptionPages, nextPageParam, OPTIONS_PAGE_SIZE, OPTIONS_STALE_TIME } from '@/modules/shared';

const $listExpenseCategories = client['expense-categories'].$get;
const $createExpenseCategory = client['expense-categories'].$post;
const $patchExpenseCategory = client['expense-categories'][':id'].$patch;
const $deleteExpenseCategory = client['expense-categories'][':id'].$delete;

export type ListExpenseCategoriesQuery = InferRequestType<typeof $listExpenseCategories>['query'];

/** A category as the list endpoint returns it, including how many expenses are filed under it. */
export type ExpenseCategoriesPage = InferResponseType<typeof $listExpenseCategories, 200>;
export type ExpenseCategory = ExpenseCategoriesPage['items'][number];

export { $createExpenseCategory, $deleteExpenseCategory, $patchExpenseCategory };

/**
 * The household's expense categories. Each search/sort combination caches separately, so the sheet's
 * listing and the unfiltered picker every table row opens don't evict each other.
 */
function listExpenseCategoriesQueryOptions(query: ListExpenseCategoriesQuery = {}) {
  return queryOptions({
    queryKey: ['expense-categories', 'list', query],
    queryFn: async () => parseResponse($listExpenseCategories({ query })),
  });
}

/** Every category as one array, for the manage sheet — which edits the vocabulary, not pages it. */
export function listAllExpenseCategoriesQueryOptions() {
  return queryOptions({
    ...listExpenseCategoriesQueryOptions({ pageSize: MAX_PAGE_SIZE }),
    select: (page: ExpenseCategoriesPage) => page.items,
  });
}

/** Categories as a picker reads them. Own `'options'` prefix — a patcher must not meet `InfiniteData`. */
export function listExpenseCategoryOptionsInfiniteQueryOptions(search?: string) {
  return infiniteQueryOptions({
    queryKey: ['expense-categories', 'options', { search }],
    queryFn: async ({ pageParam }) =>
      parseResponse($listExpenseCategories({ query: { search, pageSize: OPTIONS_PAGE_SIZE, ...pageParam } })),
    initialPageParam: { page: 1 },
    getNextPageParam: nextPageParam,
    select: flattenOptionPages,
    staleTime: OPTIONS_STALE_TIME,
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
  queryClient.setQueriesData<ExpenseCategoriesPage>({ queryKey: ['expense-categories', 'list'] }, (page) =>
    page ? { ...page, items: page.items.map((category) => (category.id === updated.id ? updated : category)) } : page
  );
}

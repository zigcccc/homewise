import { infiniteQueryOptions, type QueryClient, queryOptions } from '@tanstack/react-query';
import { type InferRequestType, type InferResponseType } from 'hono';

import { client, parseResponse } from '@/api/client';
import { flattenOptionPages, nextPageParam, OPTIONS_PAGE_SIZE, OPTIONS_STALE_TIME } from '@/modules/shared';

const $listIngredients = client.ingredients.$get;

export type ListIngredientsQuery = InferRequestType<typeof $listIngredients>['query'];

/** An ingredient as the list endpoint returns it, including its `recipeCount`. */
export type IngredientsPage = InferResponseType<typeof $listIngredients, 200>;
export type Ingredient = IngredientsPage['items'][number];

/**
 * The household's ingredient library. Each search/sort/category combination caches separately, so
 * the filtered library page and the recipe form's unfiltered picker don't evict each other.
 */
export function listIngredientsQueryOptions(query: ListIngredientsQuery = {}) {
  return queryOptions({
    queryKey: ['ingredients', 'list', query],
    queryFn: async () => parseResponse($listIngredients({ query })),
  });
}

/** The library as a picker reads it. Own `'options'` prefix — a patcher must not meet `InfiniteData`. */
export function listIngredientOptionsInfiniteQueryOptions(search?: string) {
  return infiniteQueryOptions({
    queryKey: ['ingredients', 'options', { search }],
    queryFn: async ({ pageParam }) =>
      parseResponse($listIngredients({ query: { search, pageSize: OPTIONS_PAGE_SIZE, ...pageParam } })),
    initialPageParam: { page: 1 },
    // No anchor: this list only moves on a create or rename, so offset drift is cheap here.
    getNextPageParam: nextPageParam,
    select: flattenOptionPages,
    staleTime: OPTIONS_STALE_TIME,
  });
}

/**
 * Every ingredient list variant. Creating or renaming one can reorder or re-filter any of them, so
 * the whole prefix goes rather than a single key.
 */
export function invalidateIngredients(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ['ingredients'] });
}

/**
 * Swaps an updated row into every cached list variant. A PATCH returns the row it wrote, so an
 * inline edit can show its new value immediately instead of holding the old one for a full round
 * trip — which is the entire point of editing in the table. Pair it with `invalidateIngredients`:
 * this fixes the cell, the refetch fixes ordering and filtering.
 */
export function applyIngredientUpdate(queryClient: QueryClient, updated: Ingredient) {
  queryClient.setQueriesData<IngredientsPage>({ queryKey: ['ingredients', 'list'] }, (page) =>
    page
      ? { ...page, items: page.items.map((ingredient) => (ingredient.id === updated.id ? updated : ingredient)) }
      : page
  );
}

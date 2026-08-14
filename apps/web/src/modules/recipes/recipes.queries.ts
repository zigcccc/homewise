import { infiniteQueryOptions, type QueryClient, queryOptions } from '@tanstack/react-query';
import { type InferRequestType, type InferResponseType } from 'hono';

import { client, parseResponse } from '@/api/client';
import {
  flattenOptionPages,
  nextPageParam,
  OPTIONS_PAGE_SIZE,
  OPTIONS_STALE_TIME,
  type PageParam,
} from '@/modules/shared';

const $listRecipes = client.recipes.$get;
const $getRecipe = client.recipes[':id'].$get;
const $listTags = client.recipes.tags.$get;

export type ListRecipesQuery = InferRequestType<typeof $listRecipes>['query'];

/** A recipe as the detail endpoint returns it, with ingredients, steps and tags nested. */
export type RecipeDetail = InferResponseType<typeof $getRecipe, 200>;

export function listRecipesQueryOptions(query: ListRecipesQuery = {}) {
  return queryOptions({
    queryKey: ['recipes', 'list', query],
    queryFn: async () => parseResponse($listRecipes({ query })),
  });
}

/** Recipes as a picker reads them. The endpoint already defaults to title ascending. */
export function listRecipeOptionsInfiniteQueryOptions(search?: string) {
  return infiniteQueryOptions({
    queryKey: ['recipes', 'options', { search }],
    queryFn: async ({ pageParam }) =>
      parseResponse($listRecipes({ query: { search, pageSize: OPTIONS_PAGE_SIZE, ...pageParam } })),
    initialPageParam: { page: 1 } as PageParam,
    getNextPageParam: nextPageParam,
    select: flattenOptionPages,
    staleTime: OPTIONS_STALE_TIME,
  });
}

export function getRecipeQueryOptions(id: number) {
  return queryOptions({
    queryKey: ['recipes', id],
    queryFn: async () => parseResponse($getRecipe({ param: { id: id.toString() } })),
  });
}

export function listRecipeTagsQueryOptions() {
  return queryOptions({
    queryKey: ['recipes', 'tags'],
    queryFn: async () => parseResponse($listTags()),
  });
}

/**
 * A saved recipe can change its position in any filtered list and can mint new tags, so both the
 * list prefix and the tag vocabulary go alongside the recipe itself.
 */
export function invalidateRecipe(queryClient: QueryClient, id: number) {
  void queryClient.invalidateQueries({ queryKey: ['recipes', 'list'] });
  void queryClient.invalidateQueries({ queryKey: ['recipes', 'tags'], exact: true });
  void queryClient.invalidateQueries({ queryKey: ['recipes', id] });
}

/** For deletes and creates, where there's no single recipe id left worth invalidating. */
export function invalidateRecipes(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ['recipes'] });
}

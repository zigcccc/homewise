import { type QueryKey, type UndefinedInitialDataInfiniteOptions, useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useDebounceCallback } from 'usehooks-ts';

import { SEARCH_DEBOUNCE_MS } from '../constants/search';
import { type PagedResponse } from '../helpers/paged-query';

/** `TQueryKey` stays free so it is inferred: pinned to `QueryKey`, no concrete key is assignable. */
type OptionsQueryOptions<TItem, TQueryKey extends QueryKey> = UndefinedInitialDataInfiniteOptions<
  PagedResponse<TItem>,
  Error,
  TItem[],
  TQueryKey,
  // An offset, like every other list here — see `server-conventions`.
  { page: number }
>;

/** Never the suspense variant: the nearest boundary is the route's, so it would blank the page. */
export function useAsyncOptions<TItem, TQueryKey extends QueryKey>({
  enabled,
  queryOptions,
}: {
  enabled: boolean;
  queryOptions: (search: string | undefined) => OptionsQueryOptions<TItem, TQueryKey>;
}) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  const publish = useDebounceCallback(setDebounced, SEARCH_DEBOUNCE_MS);

  const term = debounced.trim() || undefined;

  const { data, fetchNextPage, hasNextPage, isFetching, isFetchingNextPage, isLoading } = useInfiniteQuery({
    ...queryOptions(term),
    enabled,
  });

  const change = (next: string) => {
    setSearch(next);
    publish(next);
  };

  return {
    // Gated on `enabled`: a sentinel still on screen through Radix's exit animation would fetch,
    // re-render and fetch again, a loop that never lets the content unmount.
    fetchNextPage: () => {
      if (enabled) {
        void fetchNextPage();
      }
    },
    hasNextPage: enabled && hasNextPage,
    isFetchingNextPage,
    isLoading,
    items: data ?? [],
    pendingSearch: debounced,
    /** Cancels the queued term as well as clearing the box — it would otherwise land after close. */
    reset: () => {
      publish.cancel();
      setSearch('');
      setDebounced('');
    },
    search,
    setSearch: change,
    isFetching,
  };
}

import { infiniteQueryOptions, type QueryClient, queryOptions } from '@tanstack/react-query';
import { type InferResponseType } from 'hono';

import { type ActivityFilters } from '@homewise/server/activity';

import { client, parseResponse } from '@/api/client';

const $listActivity = client.activity.$get;

/** One page of the feed: the rows, plus where the next page starts (or `null` at the end). */
type ActivityPage = InferResponseType<typeof $listActivity, 200>;

/** A single logged change, as the feed and the dashboard card both render it. */
export type ActivityEntry = ActivityPage['entries'][number];

/** How many the dashboard card shows. Sliced by the server — this is the one table without a ceiling. */
export const RECENT_ACTIVITY_LIMIT = 5;

/**
 * The feed, a page at a time.
 *
 * The filters are the whole query key, so each combination caches on its own. `cursor` is not among
 * them: it is the page pointer, and TanStack Query already tracks it per page.
 */
export function listActivityQueryOptions(filters: ActivityFilters = {}) {
  return infiniteQueryOptions({
    queryKey: ['activity', 'list', filters],
    queryFn: async ({ pageParam }) =>
      parseResponse($listActivity({ query: { ...filters, cursor: pageParam ?? undefined } })),
    initialPageParam: null as number | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

/** The newest handful, for the dashboard card. Its own key, so paging the page can't disturb it. */
export function recentActivityQueryOptions() {
  return queryOptions({
    queryKey: ['activity', 'recent'],
    queryFn: async () => parseResponse($listActivity({ query: { limit: RECENT_ACTIVITY_LIMIT } })),
  });
}

/**
 * Every activity query. Always the whole prefix: a new row lands at the top of the feed under every
 * filter that admits it, and there is no id-keyed entry to be more precise about.
 */
export function invalidateActivity(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ['activity'] });
}

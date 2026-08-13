import { infiniteQueryOptions, type QueryClient, queryOptions } from '@tanstack/react-query';
import { type InferRequestType, type InferResponseType } from 'hono';

import { client, parseResponse } from '@/api/client';

const $listActivity = client.activity.$get;

/** What a feed URL narrows by — the endpoint's own query, minus the page pointer. */
type ActivityFilters = Omit<InferRequestType<typeof $listActivity>['query'], 'cursor' | 'limit'>;

/** One page of the feed: the rows, plus where the next page starts (or `null` at the end). */
type ActivityPage = InferResponseType<typeof $listActivity, 200>;

/** A single logged change, as the feed and the dashboard card both render it. */
export type ActivityEntry = ActivityPage['entries'][number];

/** How many the dashboard card shows. Sliced by the server — this is the one table without a ceiling. */
export const RECENT_ACTIVITY_LIMIT = 5;

/** The feed, a page at a time. The filters are the whole key; the cursor is tracked per page. */
export function listActivityQueryOptions(filters: ActivityFilters = {}) {
  return infiniteQueryOptions({
    queryKey: ['activity', 'list', filters],
    queryFn: async ({ pageParam: cursor }) => parseResponse($listActivity({ query: { ...filters, cursor } })),
    // A row id, not an ordinal: the first page has no cursor because it starts at the newest row.
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

/** The newest handful, for the dashboard card. Its own key, so paging the page can't disturb it. */
export function recentActivityQueryOptions() {
  return queryOptions({
    queryKey: ['activity', 'recent'],
    queryFn: async () => parseResponse($listActivity({ query: { limit: RECENT_ACTIVITY_LIMIT } })),
  });
}

/** Always the whole prefix: a new row lands at the top of the feed under every filter that admits it. */
export function invalidateActivity(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ['activity'] });
}

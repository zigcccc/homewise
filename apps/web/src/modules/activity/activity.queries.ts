import { infiniteQueryOptions, type QueryClient, queryOptions } from '@tanstack/react-query';
import { type InferRequestType, type InferResponseType } from 'hono';

import { client, parseResponse } from '@/api/client';

const $listActivity = client.activity.$get;

/** What a feed URL narrows by — the endpoint's own query, minus everything about paging it. */
type ActivityFilters = Omit<InferRequestType<typeof $listActivity>['query'], 'maxId' | 'page' | 'pageSize'>;

type ActivityPage = InferResponseType<typeof $listActivity, 200>;

/** A single logged change, as the feed and the dashboard card both render it. */
export type ActivityEntry = ActivityPage['items'][number];

/** How many the dashboard card shows. Sliced by the server — this is the one table without a ceiling. */
export const RECENT_ACTIVITY_LIMIT = 5;

/** Where a scroll is up to: which page, and the row it froze the feed at. */
type FeedCursor = { maxId?: number; page: number };

/**
 * The feed, a page at a time.
 *
 * Pages are offsets like every other list here, plus `maxId` — the newest row the *first* page saw,
 * carried forward so later pages count from a fixed set. Without it a line written while somebody
 * reads pushes the boundary down and repeats a row, and this is the one list that grows at the head
 * as you read it.
 */
export function listActivityQueryOptions(filters: ActivityFilters = {}) {
  return infiniteQueryOptions({
    queryKey: ['activity', 'list', filters],
    queryFn: async ({ pageParam }) => parseResponse($listActivity({ query: { ...filters, ...pageParam } })),
    initialPageParam: { page: 1 } as FeedCursor,
    getNextPageParam: (lastPage, _pages, lastParam): FeedCursor | undefined => {
      const shown = lastPage.page * lastPage.pageSize;

      // The anchor is taken once, off the first page's newest row, and never re-read after that.
      return shown < lastPage.total
        ? { maxId: lastParam.maxId ?? lastPage.items[0]?.id, page: lastPage.page + 1 }
        : undefined;
    },
  });
}

/** The newest handful, for the dashboard card. Its own key, so paging the page can't disturb it. */
export function recentActivityQueryOptions() {
  return queryOptions({
    queryKey: ['activity', 'recent'],
    queryFn: async () => parseResponse($listActivity({ query: { pageSize: RECENT_ACTIVITY_LIMIT } })),
  });
}

/** Always the whole prefix: a new row lands at the top of the feed under every filter that admits it. */
export function invalidateActivity(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ['activity'] });
}

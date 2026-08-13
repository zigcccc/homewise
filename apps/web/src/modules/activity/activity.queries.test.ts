import { describe, expect, it } from 'vitest';

import { type ActivityEntry, listActivityQueryOptions } from './activity.queries';

/**
 * How the feed decides where its next page starts.
 *
 * The whole correctness of paging an *append-at-the-head* list rests on this one function, and none
 * of it is reachable from a spec: it takes two members writing and reading at the same moment.
 *
 * The half that isn't tested here is TanStack's, and it is what makes the anchor safe to keep: on a
 * refetch, `infiniteQueryBehavior` re-uses only the *first* page's stored param and recomputes every
 * later one through this function (`currentPage === 0 ? oldPageParams[0] : getNextPageParam(...)`).
 * The first param is `initialPageParam`, which never carries a `maxId` — so an invalidation reads
 * the newest rows and re-anchors from them, rather than staying pinned to a stale id.
 */
const nextPageParam = listActivityQueryOptions().getNextPageParam;

const page = (overrides: Partial<Parameters<typeof nextPageParam>[0]> = {}) => ({
  items: [] as ActivityEntry[],
  page: 1,
  pageSize: 20,
  total: 100,
  ...overrides,
});

/** Only the id matters here — it is what the anchor is taken from. */
const entry = (id: number) => ({ id }) as ActivityEntry;

describe('the activity feed page param', () => {
  it('should anchor the second page to the newest row the first one saw', () => {
    // GIVEN: a first page, which is asked for without an anchor
    const first = page({ items: [entry(910), entry(909)] });

    // WHEN: the next page is worked out
    const next = nextPageParam(first, [first], { page: 1 }, [{ page: 1 }]);

    // THEN: it should carry the newest id forward, so the offset counts from a set that can't grow
    expect(next).toStrictEqual({ maxId: 910, page: 2 });
  });

  it('should keep the original anchor rather than re-reading it each page', () => {
    // GIVEN: a third page, whose own newest row is far below where the scroll started
    const third = page({ items: [entry(870), entry(869)], page: 3 });

    // WHEN: the fourth is worked out
    const next = nextPageParam(third, [third], { maxId: 910, page: 3 }, [{ maxId: 910, page: 3 }]);

    // THEN: the anchor should still be the one taken at the top — re-reading it per page would let
    // the set drift, which is the thing it exists to prevent
    expect(next).toStrictEqual({ maxId: 910, page: 4 });
  });

  it('should stop once the pages read cover the total', () => {
    // GIVEN: a last page, exactly exhausting the feed
    const last = page({ items: [entry(1)], page: 5, pageSize: 20, total: 100 });

    // WHEN: the next page is worked out
    // THEN: there should not be one
    expect(nextPageParam(last, [last], { maxId: 910, page: 5 }, [{ maxId: 910, page: 5 }])).toBeUndefined();
  });

  it('should stop on a feed that fits in one page', () => {
    const only = page({ items: [entry(3)], total: 1 });

    expect(nextPageParam(only, [only], { page: 1 }, [{ page: 1 }])).toBeUndefined();
  });
});

import { type InfiniteData } from '@tanstack/react-query';

import { DEFAULT_PAGE_SIZE } from '@homewise/server/models';

/** One offset page, as every list endpoint answers it. */
export type PagedEnvelope = { page: number; pageSize: number; total: number };

/** A page of rows, as an options query reads it. */
export type PagedResponse<TItem> = PagedEnvelope & { items: TItem[] };

/** Where an options query is up to. An offset, like every other list — see `server-conventions`. */
export type PageParam = { page: number };

/** Must overflow `ComboboxList`'s 300px box, or the sentinel stays visible and pages to exhaustion. */
export const OPTIONS_PAGE_SIZE = DEFAULT_PAGE_SIZE;

/** Reopening a picker is then instant; realtime invalidation is what keeps it honest. */
export const OPTIONS_STALE_TIME = 60_000;

/** Read off the response, never the request: the server clamps past-the-end, so asking would loop. */
export const nextPageParam = (last: PagedEnvelope): PageParam | undefined =>
  last.page * last.pageSize < last.total ? { page: last.page + 1 } : undefined;

/** Hoisted for identity: a fresh arrow per call remounts a `DataTable` cell and closes its picker. */
export const flattenOptionPages = <TItem>(data: InfiniteData<PagedResponse<TItem>>) =>
  data.pages.flatMap((page) => page.items);

/** Only trustworthy once settled — against a previous term's rows this answers the wrong search. */
export const shouldOfferCreate = ({
  isFetching,
  items,
  pendingSearch,
  search,
}: {
  isFetching: boolean;
  items: { name: string }[];
  /** The debounced term the query is running. */
  pendingSearch: string;
  /** The term in the box. */
  search: string;
}) => {
  const query = search.trim().toLowerCase();

  if (!query || isFetching || query !== pendingSearch.trim().toLowerCase()) {
    return false;
  }

  return !items.some((item) => item.name.toLowerCase() === query);
};

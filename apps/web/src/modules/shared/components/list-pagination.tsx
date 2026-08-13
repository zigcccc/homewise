import { PAGE_SIZE_OPTIONS } from '@homewise/server/models';
import { DataTablePagination } from '@homewise/ui/core';

/** The half of a paginated list response that describes the page rather than the rows. */
export type PageEnvelope = { page: number; pageSize: number; total: number };

/**
 * The pagination bar every paginated list ends with, wired to the route's search params.
 *
 * Takes the response's own `{ page, pageSize, total }` rather than the route's search params,
 * because the two disagree exactly when it matters: deleting the last page's rows leaves the URL
 * asking for a page the server no longer has, and the server answers with the page it clamped to.
 * Reading the URL here would draw a pager for a page that isn't on screen.
 *
 * **Stuck to the bottom of the scrollport**, which is what makes a page size of 100 usable at all:
 * in normal flow the controls for turning the page sit *below* the page, so reaching them means
 * scrolling past every row first. `sticky` rather than `fixed` because it no-ops on a list that
 * already fits — the bar simply sits where it falls, with no reserved strip over a half-empty table.
 *
 * The scrollport is the `_onboarded` route's own div, not the document; `bottom-0` resolves against
 * that. `-mb-4` cancels `PageLayout`'s bottom padding so the bar's resting place is flush with where
 * it sticks, rather than lurching up 16px as the last row arrives.
 */
export function ListPagination({
  page,
  setSearchParam,
}: {
  page: PageEnvelope;
  /** The route's `useSearchParamSetter`, narrowed to the two keys this sets. */
  setSearchParam: (key: 'page' | 'pageSize', value: number) => void;
}) {
  return (
    <DataTablePagination
      className="sticky bottom-0 z-10 -mb-4 border-t bg-background py-3"
      onPageChange={(next) => setSearchParam('page', next)}
      onPageSizeChange={(next) => setSearchParam('pageSize', next)}
      page={page.page}
      pageSize={page.pageSize}
      pageSizeOptions={PAGE_SIZE_OPTIONS}
      total={page.total}
    />
  );
}

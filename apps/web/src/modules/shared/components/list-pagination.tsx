import { PAGE_SIZE_OPTIONS } from '@homewise/server/models';
import { DataTablePagination } from '@homewise/ui/core';

/** The half of a list response that describes the page rather than the rows. */
export type PageEnvelope = { page: number; pageSize: number; total: number };

/**
 * The pagination bar every paginated list ends with. Takes the **response's** page, not the URL's —
 * an overshooting page is clamped server-side. `-mb-4` cancels `PageLayout`'s `p-4` so the bar's
 * resting position matches its stuck one.
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

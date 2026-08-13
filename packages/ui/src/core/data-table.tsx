import {
  type Table as CoreTable,
  flexRender,
  getCoreRowModel,
  type RowData,
  type TableOptions,
  useReactTable,
} from '@tanstack/react-table';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  MoreHorizontalIcon,
  Rows3Icon,
} from 'lucide-react';
import { type ReactNode } from 'react';

import { cn } from '#lib/utils';

import { Button } from './button';
import { ButtonGroup } from './button-group';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from './empty';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';

declare module '@tanstack/react-table' {
  // Both type parameters are unused here but have to be declared to match the interface being
  // augmented — drop either one and the augmentation silently stops applying.
  interface ColumnMeta<TData extends RowData, TValue> {
    /**
     * Classes for this column's `<th>` **and** every one of its `<td>`s.
     *
     * The table is `w-full` with auto layout, so leftover width is shared out among the columns and
     * a column holding nothing but an icon button still gets a slice of it. `w-px` is the way out:
     * a width below the content's own minimum collapses the column to exactly its content.
     */
    className?: string;
    headerClassName?: string;
  }
}

/**
 * Row identity for `useReactTable`, to pass as its `getRowId`. Not optional in practice: the default
 * is the row's *index*, which becomes React's key here — so when the data changes, every row's
 * subtree keeps whatever state it had at that position while its props move on to a different
 * record. A cell editing in place then belongs to one row and writes to another. Keying by the
 * record's own id makes React move the subtree with the record instead, and drop it when the record
 * goes. The data doesn't have to change *under* the user for this to bite: another household member
 * adding a row is enough, since realtime refetches the list beneath an open editor.
 */
export const getRowId = <Data extends { id: number | string }>(row: Data) => String(row.id);

/**
 * `useReactTable` with the two options every table in this app was passing by hand.
 *
 * `getRowId` is the one that matters — see above; leaving it to the caller means one table
 * eventually ships without it and starts committing an inline edit to the wrong record. Both are
 * still overridable, so a table that needs sorting or filtering row models just passes its own.
 */
export function useDataTable<Data extends { id: number | string }>(
  options: Omit<TableOptions<Data>, 'getCoreRowModel'> & Partial<Pick<TableOptions<Data>, 'getCoreRowModel'>>
) {
  return useReactTable({ getCoreRowModel: getCoreRowModel(), getRowId, ...options });
}

function DefaultEmptyComponent() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Rows3Icon />
        </EmptyMedia>
        <EmptyTitle>No results found</EmptyTitle>
      </EmptyHeader>
    </Empty>
  );
}

/**
 * Anything inside a row that handles its own click. A row-level handler must not fire for these, or
 * opening the row-actions menu also navigates away from the row you were acting on.
 */
const INTERACTIVE_IN_ROW = 'a, button, input, select, textarea, [role="menuitem"], [role="option"]';

/** How many page buttons the bar shows, ellipses included, so its width never changes as you page. */
const PAGE_WINDOW = 7;
/** The current page keeps a neighbour either side once both ends are pinned and both ellipses are in. */
const AROUND_CURRENT = 1;

/**
 * Which pages the bar offers: the first, the last, the current and its neighbours, with a gap
 * standing in for each run it skips.
 *
 * Always {@link PAGE_WINDOW} entries once there are more pages than that, which is the point — a bar
 * that grew and shrank as you paged would move the button you were about to click. The two gaps are
 * named rather than both being `'ellipsis'` so every entry is its own React key.
 */
export function pageWindow(page: number, pageCount: number): (number | 'gap-before' | 'gap-after')[] {
  const all = Array.from({ length: pageCount }, (_, index) => index + 1);

  if (pageCount <= PAGE_WINDOW) {
    return all;
  }

  // Near either end there is nothing to elide on that side, so the run grows to spend the slot the
  // missing gap freed rather than leaving a hole.
  const runLength = PAGE_WINDOW - 3;

  if (page <= runLength) {
    return [...all.slice(0, runLength + 1), 'gap-after', pageCount];
  }

  if (page > pageCount - runLength) {
    return [1, 'gap-before', ...all.slice(-(runLength + 1))];
  }

  return [1, 'gap-before', ...all.slice(page - 1 - AROUND_CURRENT, page + AROUND_CURRENT), 'gap-after', pageCount];
}

/**
 * The bar under a paginated list: rows per page, which of them you're looking at, pages to jump to.
 *
 * Deliberately takes no `table` — sorting, filtering and the page all live in the URL here, so there
 * is no table state to read, and a list with no table at all (the recipe grid) can use the same bar.
 *
 * Pass the page the **server** answered with, not the one the URL asked for.
 */
export function DataTablePagination({
  className,
  onPageChange,
  onPageSizeChange,
  page,
  pageSize,
  pageSizeOptions,
  total,
}: {
  className?: string;
  page: number;
  pageSize: number;
  pageSizeOptions: readonly number[];
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  const isFirstPage = page <= 1;
  const isLastPage = page >= pageCount;

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-4', className)}>
      <div className="flex items-center gap-2">
        <Select onValueChange={(value) => onPageSizeChange(Number(value))} value={pageSize.toString()}>
          <SelectTrigger aria-label="Rows per page" className="w-20" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((option) => (
              <SelectItem key={option} value={option.toString()}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-sm">
          {first}–{last} of {total}
        </p>
      </div>

      <ButtonGroup aria-label="Pagination">
        <Button
          aria-label="First page"
          disabled={isFirstPage}
          onClick={() => onPageChange(1)}
          size="icon-sm"
          variant="outline"
        >
          <ChevronsLeftIcon />
        </Button>
        <Button
          aria-label="Previous page"
          disabled={isFirstPage}
          onClick={() => onPageChange(page - 1)}
          size="icon-sm"
          variant="outline"
        >
          <ChevronLeftIcon />
        </Button>

        {pageWindow(page, pageCount).map((entry) =>
          typeof entry === 'string' ? (
            <Button aria-hidden disabled key={entry} size="icon-sm" tabIndex={-1} variant="outline">
              <MoreHorizontalIcon />
            </Button>
          ) : (
            <Button
              aria-current={entry === page ? 'page' : undefined}
              aria-label={`Page ${entry}`}
              key={entry}
              onClick={() => onPageChange(entry)}
              size="icon-sm"
              variant={entry === page ? 'default' : 'outline'}
            >
              {entry}
            </Button>
          )
        )}

        <Button
          aria-label="Next page"
          disabled={isLastPage}
          onClick={() => onPageChange(page + 1)}
          size="icon-sm"
          variant="outline"
        >
          <ChevronRightIcon />
        </Button>
        <Button
          aria-label="Last page"
          disabled={isLastPage}
          onClick={() => onPageChange(pageCount)}
          size="icon-sm"
          variant="outline"
        >
          <ChevronsRightIcon />
        </Button>
      </ButtonGroup>
    </div>
  );
}

export function DataTable<Data extends Record<string, unknown>>({
  emptyContent = <DefaultEmptyComponent />,
  onRowClick,
  table,
}: {
  table: CoreTable<Data>;
  emptyContent?: ReactNode;
  /**
   * Makes the whole row clickable — for a table whose rows lead somewhere.
   *
   * A convenience for the mouse, never the only way in: a `<tr>` can't take focus, so the row still
   * has to contain a real link for the keyboard and for anything reading the page. This just widens
   * the target to the row that link sits in.
   */
  onRowClick?: (row: Data) => void;
}) {
  const headers = table.getHeaderGroups();
  const rows = table.getRowModel().rows;
  const columns = table.getAllColumns();

  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          {headers.map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead
                    className={cn(
                      header.column.columnDef.meta?.className,
                      header.column.columnDef.meta?.headerClassName
                    )}
                    key={header.id}
                  >
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows?.length ? (
            rows.map((row) => (
              <TableRow
                className={cn(onRowClick && 'cursor-pointer')}
                data-state={row.getIsSelected() && 'selected'}
                key={row.id}
                onClick={
                  onRowClick &&
                  ((event) => {
                    if (!(event.target as HTMLElement).closest(INTERACTIVE_IN_ROW)) {
                      onRowClick(row.original);
                    }
                  })
                }
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell className={cell.column.columnDef.meta?.className} key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow className="hover:bg-inherit">
              <TableCell className="min-h-24 text-center" colSpan={columns.length}>
                {emptyContent}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

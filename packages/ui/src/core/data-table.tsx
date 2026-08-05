import {
  type Table as CoreTable,
  flexRender,
  getCoreRowModel,
  type RowData,
  type TableOptions,
  useReactTable,
} from '@tanstack/react-table';
import { Rows3Icon } from 'lucide-react';
import { type ReactNode } from 'react';

import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from './empty';
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

export function DataTable<Data extends Record<string, unknown>>({
  emptyContent = <DefaultEmptyComponent />,
  table,
}: {
  table: CoreTable<Data>;
  emptyContent?: ReactNode;
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
                  <TableHead className={header.column.columnDef.meta?.className} key={header.id}>
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
              <TableRow data-state={row.getIsSelected() && 'selected'} key={row.id}>
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

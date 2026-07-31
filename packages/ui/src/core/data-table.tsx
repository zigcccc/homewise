import { type Table as CoreTable, flexRender } from '@tanstack/react-table';
import { Rows3Icon } from 'lucide-react';
import { type ReactNode } from 'react';

import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from './empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';

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
                  <TableHead key={header.id}>
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
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
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

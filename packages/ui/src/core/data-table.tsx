import { flexRender, type Table as CoreTable } from '@tanstack/react-table';
import { Rows3Icon } from 'lucide-react';
import { type ReactNode } from 'react';

import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from './empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';

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
              <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
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

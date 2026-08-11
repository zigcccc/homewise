import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { createColumnHelper } from '@tanstack/react-table';
import { HandCoinsIcon, MoreHorizontal, MoveRightIcon, PencilIcon, TrashIcon, UndoIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { storageItemName } from '@homewise/server/storage-items';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Thumbnail,
} from '@homewise/ui/core';

import { parseResponse } from '@/api/client';
import { ConfirmDeleteDialog, formatDate, InlineCell, serverMessage, todayISODay } from '@/modules/shared';
import { invalidateStorageLocations, listStorageLocationOptionsQueryOptions } from '@/modules/storage-locations';

import { LOAN_STATUS_LABELS, resolveLoanStatus } from '../helpers/loan';
import { quantityText } from '../helpers/quantity';
import { useInlineItemPatch } from '../hooks/use-inline-item-patch';
import {
  $deleteStorageItem,
  $returnStorageItem,
  applyStorageItemUpdate,
  invalidateStorageItems,
  type StorageItem,
} from '../storage-items.queries';
import { ItemFormDialog } from './item-form-dialog';
import { LendItemDialog } from './lend-item-dialog';

const columnHelper = createColumnHelper<StorageItem>();

/**
 * The item table, shared by the global list and one location's contents. The location column is
 * dropped on a location's own page, where every row would repeat the page's own title.
 */
export function createStorageItemColumns({ showLocation }: { showLocation: boolean }) {
  return [
    columnHelper.accessor('photoUrl', {
      header: '',
      cell: (info) => <Thumbnail alt={info.row.original.name} src={info.getValue()} />,
      meta: { className: 'w-px' },
    }),
    columnHelper.accessor('name', {
      header: 'Item',
      cell: (info) => <ItemNameCell id={info.row.original.id} name={info.getValue()} notes={info.row.original.notes} />,
      meta: { headerClassName: 'pl-4' },
    }),
    columnHelper.accessor('quantity', {
      header: 'Qty',
      cell: (info) => <QuantityCell id={info.row.original.id} quantity={info.getValue()} />,
    }),
    ...(showLocation
      ? [
          columnHelper.accessor((item) => item.location.name, {
            id: 'location',
            header: 'Location',
            cell: (info) => (
              <Link
                className="underline-offset-4 hover:underline"
                params={{ locationId: info.row.original.locationId.toString() }}
                to="/storage/locations/$locationId"
              >
                {info.getValue()}
              </Link>
            ),
          }),
        ]
      : []),
    columnHelper.accessor('loan', {
      header: 'Status',
      cell: (info) => <LoanCell loan={info.getValue()} />,
    }),
    columnHelper.display({
      id: 'actions',
      header: '',
      // The one cell that legitimately takes the whole row: its menu labels and delete dialog name
      // the record, and its "Move to" needs the location it is currently in.
      cell: (info) => <ItemRowActions item={info.row.original} />,
    }),
  ];
}

function QuantityCell({ id, quantity }: { id: number; quantity: number }) {
  const { save } = useInlineItemPatch(id);

  return (
    <InlineCell
      ariaLabel="Quantity"
      display={String(quantity)}
      displayClassName="tabular-nums"
      maxWidthClassName="max-w-20"
      onSave={async (value) => save({ quantity: Number(value) })}
      schema={quantityText}
      value={String(quantity)}
    />
  );
}

function ItemNameCell({ id, name, notes }: { id: number; name: string; notes: string | null }) {
  const { save } = useInlineItemPatch(id);

  return (
    <div className="space-y-0.5">
      <InlineCell
        ariaLabel="Item name"
        display={name}
        fill
        onSave={async (value) => save({ name: value })}
        schema={storageItemName}
        value={name}
      />
      {notes && <p className="truncate px-2 text-muted-foreground text-xs">{notes}</p>}
    </div>
  );
}

function LoanCell({ loan }: { loan: StorageItem['loan'] }) {
  const status = resolveLoanStatus(loan, todayISODay());

  if (!loan) {
    return <Badge variant="outline">{LOAN_STATUS_LABELS.available}</Badge>;
  }

  return (
    <div className="flex items-center gap-1">
      <Badge variant={status === 'overdue' ? 'destructive' : 'secondary'}>{LOAN_STATUS_LABELS[status]}</Badge>
      <p className="text-muted-foreground text-xs">
        {loan.name}
        {loan.dueOn && ` · due ${formatDate(loan.dueOn)}`}
      </p>
    </div>
  );
}

function ItemRowActions({ item }: { item: StorageItem }) {
  const queryClient = useQueryClient();
  // The options projection, not the full list: an item written anywhere moves every location's
  // count, and this menu would re-render on numbers it never shows.
  const { data: locations } = useSuspenseQuery(listStorageLocationOptionsQueryOptions());
  const { saveOrToast } = useInlineItemPatch(item.id);
  const [editOpen, setEditOpen] = useState(false);
  const [lendOpen, setLendOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { mutateAsync: deleteItem } = useMutation({
    mutationFn: async () => parseResponse($deleteStorageItem({ param: { id: item.id.toString() } })),
  });

  const { mutateAsync: markReturned } = useMutation({
    mutationFn: async () => parseResponse($returnStorageItem({ param: { id: item.id.toString() } })),
    onSuccess: (updated) => {
      applyStorageItemUpdate(queryClient, updated);
      invalidateStorageItems(queryClient);
      invalidateStorageLocations(queryClient);
    },
  });

  const handleDelete = async () => {
    try {
      await deleteItem();
      toast.success(`"${item.name}" deleted.`);
      invalidateStorageItems(queryClient);
      invalidateStorageLocations(queryClient);
    } catch (error) {
      toast.error(serverMessage(error, 'Something went wrong.'));
      throw error;
    }
  };

  const handleReturn = async () => {
    try {
      await markReturned();
      toast.success(`"${item.name}" is back.`);
    } catch (error) {
      toast.error(serverMessage(error, 'Something went wrong.'));
    }
  };

  const elsewhere = locations.filter((location) => location.id !== item.locationId);

  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="h-8 w-8 p-0" variant="ghost">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <PencilIcon />
            Edit item
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={elsewhere.length === 0}>
              <MoveRightIcon />
              Move to
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                {elsewhere.map((location) => (
                  <DropdownMenuItem key={location.id} onClick={() => void saveOrToast({ locationId: location.id })}>
                    {location.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          {item.loan ? (
            <DropdownMenuItem onClick={() => void handleReturn()}>
              <UndoIcon />
              Mark returned
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => setLendOpen(true)}>
              <HandCoinsIcon />
              Lend it out
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => setDeleteOpen(true)} variant="destructive">
            <TrashIcon />
            Delete item
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {editOpen && <ItemFormDialog item={item} onOpenChange={setEditOpen} open={editOpen} />}
      {lendOpen && <LendItemDialog item={item} onOpenChange={setLendOpen} open={lendOpen} />}

      <ConfirmDeleteDialog
        confirmLabel="Delete item"
        description={
          item.loan ? (
            <>
              "{item.name}" is currently out with {item.loan.name}. Deleting it here won't get it back.
            </>
          ) : (
            <>
              "{item.name}" will be permanently removed from {item.location.name}.
            </>
          )
        }
        onConfirm={handleDelete}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        title={`Delete "${item.name}"?`}
      />
    </div>
  );
}

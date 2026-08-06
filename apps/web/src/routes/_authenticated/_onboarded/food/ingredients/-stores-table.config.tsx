import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { MoreHorizontal, PencilIcon, TrashIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { createStoreModel } from '@homewise/server/stores';
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@homewise/ui/core';

import { parseResponse } from '@/api/client';
import { invalidateIngredients } from '@/modules/ingredients';
import { ConfirmDeleteDialog, InlineCell, serverMessage } from '@/modules/shared';
import { $deleteStore, invalidateStores, type Store, StoreFormDialog, useInlineStorePatch } from '@/modules/stores';

const columnHelper = createColumnHelper<Store>();

/** The name is edited straight in the table; the dialog stays the way to reach the notes field. */
export const storesTableColumns = [
  columnHelper.accessor('name', {
    header: 'Name',
    cell: (info) => <StoreNameCell id={info.row.original.id} name={info.getValue()} />,
  }),
  columnHelper.accessor('notes', {
    header: 'Notes',
    cell: (info) => <span className="text-muted-foreground text-sm">{info.getValue() || '—'}</span>,
  }),
  columnHelper.accessor('ingredientCount', {
    header: 'Bought here',
    cell: (info) => `${info.getValue()} ${info.getValue() === 1 ? 'ingredient' : 'ingredients'}`,
  }),
  columnHelper.display({
    id: 'actions',
    cell: (info) => <StoreRowActions store={info.row.original} />,
    header: '',
  }),
];

function StoreNameCell({ id, name }: { id: number; name: string }) {
  const { save } = useInlineStorePatch(id);

  return (
    <InlineCell
      ariaLabel="Name"
      display={name}
      fill
      onSave={async (value) => save({ name: value })}
      schema={createStoreModel.shape.name}
      value={name}
    />
  );
}

function StoreRowActions({ store }: { store: Store }) {
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { mutateAsync: deleteStore } = useMutation({
    mutationFn: async () => parseResponse($deleteStore({ param: { id: store.id.toString() } })),
  });

  const handleDelete = async () => {
    try {
      await deleteStore();
      toast.success(`"${store.name}" deleted.`);
      invalidateStores(queryClient);
      // Every ingredient that defaulted to this shop just lost that default.
      invalidateIngredients(queryClient);
    } catch (error) {
      toast.error(serverMessage(error, 'Something went wrong.'));
      throw error;
    }
  };

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
            Edit shop
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDeleteOpen(true)} variant="destructive">
            <TrashIcon />
            Delete shop
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <StoreFormDialog onOpenChange={setEditOpen} open={editOpen} store={store} />

      <ConfirmDeleteDialog
        confirmLabel="Delete shop"
        description={
          store.ingredientCount > 0 ? (
            <>
              "{store.name}" will be permanently removed. The {store.ingredientCount}{' '}
              {store.ingredientCount === 1 ? 'ingredient' : 'ingredients'} bought here will keep their place in the
              library, just without a shop.
            </>
          ) : (
            <>"{store.name}" will be permanently removed from your shops.</>
          )
        }
        onConfirm={handleDelete}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        title={`Delete "${store.name}"?`}
      />
    </div>
  );
}

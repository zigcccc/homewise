import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, PencilIcon, TrashIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { shoppingListItemTitle, shoppingListSectionName } from '@homewise/server/shopping-lists';
import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@homewise/ui/core';

import { parseResponse } from '@/api/client';
import { formatQuantity } from '@/modules/ingredients';
import { InlineTextField, serverMessage } from '@/modules/shared';
import {
  $deleteSection,
  $patchSection,
  applyShoppingListDetail,
  invalidateShoppingLists,
  type SectionWithItems,
  type ShoppingListDetail,
  type ShoppingListItem,
  useListMutations,
} from '@/modules/shopping-lists';

/**
 * One heading and the items under it. `section` is `null` for the ungrouped bucket — the items that
 * came from a shop-less ingredient or were typed in as one-offs — which gets no heading of its own
 * until there's something else to distinguish it from.
 */
export function ListSection({
  items,
  listId,
  readOnly,
  section,
}: SectionWithItems & { listId: number; readOnly: boolean }) {
  const queryClient = useQueryClient();
  const [renaming, setRenaming] = useState(false);

  const onWritten = (detail: ShoppingListDetail) => {
    applyShoppingListDetail(queryClient, detail);
    invalidateShoppingLists(queryClient);
  };

  const param = { id: listId.toString(), sectionId: (section?.id ?? 0).toString() };

  const { mutateAsync: rename } = useMutation({
    mutationFn: async (name: string) => parseResponse($patchSection({ param, json: { name } })),
    onSuccess: onWritten,
  });

  const { mutateAsync: removeSection } = useMutation({
    mutationFn: async () => parseResponse($deleteSection({ param })),
    onSuccess: onWritten,
  });

  const handleRemoveSection = async () => {
    try {
      await removeSection();
      toast.success('Section removed — its items are still on the list.');
    } catch (error) {
      toast.error(serverMessage(error, 'Something went wrong.'));
    }
  };

  return (
    <section className="space-y-1">
      {section && (
        <div className="flex items-center justify-between gap-2">
          {renaming ? (
            <InlineTextField
              ariaLabel="Section name"
              cancellable
              className="h-8"
              defaultValue={section.label}
              onDone={() => setRenaming(false)}
              onSave={async (value) => rename(value)}
              schema={shoppingListSectionName}
            />
          ) : (
            <h2 className="font-medium text-muted-foreground text-sm uppercase tracking-wide">{section.label}</h2>
          )}
          {!readOnly && !renaming && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="h-7 w-7 p-0" variant="ghost">
                  <span className="sr-only">Section actions</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setRenaming(true)}>
                  <PencilIcon />
                  Rename section
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleRemoveSection} variant="destructive">
                  <TrashIcon />
                  Remove section
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}

      <ul className="divide-y rounded-md border">
        {items.map((item) => (
          // Keyed by the record's own id, never by position: an open inline editor has to follow the
          // item it was opened on when a realtime refetch reorders the list underneath it.
          <ListItemRow item={item} key={item.id} listId={listId} readOnly={readOnly} />
        ))}
      </ul>
    </section>
  );
}

function ListItemRow({ item, listId, readOnly }: { item: ShoppingListItem; listId: number; readOnly: boolean }) {
  const [editing, setEditing] = useState(false);
  const { removeItemOrToast, saveItem, saveItemOrToast } = useListMutations(listId);

  const checked = item.checkedAt !== null;
  // Only when there's a number to show. `formatQuantity` renders a quantity-less line as "to taste",
  // which is right for a recipe and wrong here — "bread" just has no amount.
  const amount = item.quantity === null ? null : formatQuantity(item.quantity, item.unit);

  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <Checkbox
        aria-label={`Tick ${item.label}`}
        checked={checked}
        disabled={readOnly}
        onCheckedChange={(next) => void saveItemOrToast(item.id, { checked: next === true })}
      />

      <div className="min-w-0 flex-1">
        {editing ? (
          // Mounted only while editing, so `defaultValues` reseed on every open with no reset effect.
          <InlineTextField
            ariaLabel="Item name"
            cancellable
            className="h-8"
            defaultValue={item.label}
            onDone={() => setEditing(false)}
            onSave={async (value) => saveItem({ itemId: item.id, json: { title: value } })}
            schema={shoppingListItemTitle}
          />
        ) : (
          <button
            className={`flex w-full cursor-pointer items-baseline gap-2 rounded-md text-left text-sm hover:bg-accent ${
              checked ? 'text-muted-foreground line-through' : ''
            }`}
            // Only a free-text line can be renamed; an ingredient's label lives on the library row.
            disabled={readOnly || item.ingredientId !== null}
            onClick={() => setEditing(true)}
            type="button"
          >
            <span className="min-w-0 truncate">{item.label}</span>
            {amount && <span className="shrink-0 text-muted-foreground text-xs">{amount}</span>}
          </button>
        )}
        {item.note && <p className="text-muted-foreground text-xs">{item.note}</p>}
        {checked && item.checkedBy && <p className="text-muted-foreground text-xs">Got by {item.checkedBy}</p>}
      </div>

      {!readOnly && (
        <Button className="h-7 w-7 shrink-0 p-0" onClick={() => void removeItemOrToast(item.id)} variant="ghost">
          <span className="sr-only">Remove {item.label}</span>
          <TrashIcon className="h-4 w-4" />
        </Button>
      )}
    </li>
  );
}

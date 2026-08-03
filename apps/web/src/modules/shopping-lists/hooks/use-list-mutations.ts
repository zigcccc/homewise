import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { parseResponse } from '@/api/client';
import { serverMessage } from '@/modules/shared';

import {
  $createItem,
  $deleteItem,
  $patchItem,
  applyShoppingListDetail,
  type CreateItemPayload,
  invalidateShoppingLists,
  type PatchItemPayload,
  type ShoppingListDetail,
} from '../shopping-lists.queries';

/**
 * The writes an open list makes: adding an item, editing one in place, ticking it off, removing it.
 *
 * Takes the list id once, at mount. Every endpoint returns the whole list — one write routinely
 * moves more than the row it names — so each success swaps that straight into the cache before the
 * invalidation's refetch lands, which is what keeps ticking a box feeling instant.
 *
 * `saveItem` throws so an `InlineTextField` can keep its editor open on a refusal; the `*OrToast`
 * variants are for the controls with nowhere to hang a message — a checkbox has no field.
 */
export function useListMutations(listId: number) {
  const queryClient = useQueryClient();
  const param = { id: listId.toString() };

  const onSuccess = (detail: ShoppingListDetail) => {
    applyShoppingListDetail(queryClient, detail);
    invalidateShoppingLists(queryClient);
  };

  const { mutateAsync: addItem, isPending: isAdding } = useMutation({
    mutationFn: async (json: CreateItemPayload) => parseResponse($createItem({ param, json })),
    onSuccess,
  });

  const { mutateAsync: saveItem } = useMutation({
    mutationFn: async ({ itemId, json }: { itemId: number; json: PatchItemPayload }) =>
      parseResponse($patchItem({ param: { ...param, itemId: itemId.toString() }, json })),
    onSuccess,
  });

  const { mutateAsync: removeItem } = useMutation({
    mutationFn: async (itemId: number) =>
      parseResponse($deleteItem({ param: { ...param, itemId: itemId.toString() } })),
    onSuccess,
  });

  const saveItemOrToast = async (itemId: number, json: PatchItemPayload) => {
    try {
      await saveItem({ itemId, json });
    } catch (error) {
      toast.error(serverMessage(error, 'Something went wrong.'));
    }
  };

  const addItemOrToast = async (json: CreateItemPayload) => {
    try {
      await addItem(json);
    } catch (error) {
      toast.error(serverMessage(error, 'Something went wrong.'));
    }
  };

  const removeItemOrToast = async (itemId: number) => {
    try {
      await removeItem(itemId);
    } catch (error) {
      toast.error(serverMessage(error, 'Something went wrong.'));
    }
  };

  return { addItemOrToast, isAdding, removeItemOrToast, saveItem, saveItemOrToast };
}

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
 * The writes an open list makes: adding an item, editing one in place, ticking it off, dragging it
 * to another shop, removing it.
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

  /**
   * Persists where a drop landed: the row belongs in `sectionId` at `position`.
   *
   * No optimistic write of its own — `applyItemArrangement` has been keeping the cache in step with
   * the drag since it started, so by the time this fires the screen is already right. A refusal is
   * recovered by refetching rather than by rolling back a snapshot: a rejected move is rare, and the
   * server is the only thing that knows what the order really is once one has failed.
   */
  const { mutateAsync: moveItem } = useMutation({
    mutationFn: async ({
      itemId,
      position,
      // Omitted when the row stayed in its own section, so the request says what actually happened:
      // sending it anyway makes every reorder look like a move and costs the old section a pointless
      // renumber and prune check.
      sectionId,
    }: {
      itemId: number;
      position: number;
      sectionId?: number | null;
    }) => parseResponse($patchItem({ param: { ...param, itemId: itemId.toString() }, json: { position, sectionId } })),
    onSuccess,
    onError: (error) => {
      toast.error(serverMessage(error, 'Could not move that item.'));
      invalidateShoppingLists(queryClient);
    },
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

  return { addItemOrToast, isAdding, moveItem, removeItemOrToast, saveItem, saveItemOrToast };
}

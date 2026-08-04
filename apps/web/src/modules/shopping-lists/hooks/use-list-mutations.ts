import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { parseResponse } from '@/api/client';
import { serverMessage } from '@/modules/shared';

import {
  $createItem,
  $deleteItem,
  $patchItem,
  applyItemPatch,
  applyShoppingListDetail,
  type CreateItemPayload,
  getShoppingListQueryOptions,
  invalidateShoppingLists,
  type PatchItemPayload,
  type ShoppingListDetail,
  type ShoppingListItem,
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
   * Ticking a box, written to the cache before the request leaves.
   *
   * The one mutation here that has to be optimistic: this is used while walking round a shop, on
   * whatever signal the shop has, and a checkbox that waits for a round trip reads as a hung app.
   * `checkedBy` is deliberately not guessed — the server's answer fills in "Got by …" a moment later.
   */
  const { mutate: toggleChecked } = useMutation({
    mutationFn: async ({ checked, itemId }: { checked: boolean; itemId: number }) =>
      parseResponse($patchItem({ param: { ...param, itemId: itemId.toString() }, json: { checked } })),
    onMutate: async ({ checked, itemId }) => {
      // Without this, a refetch already in flight can land after the optimistic write and put the
      // old value straight back on screen.
      await queryClient.cancelQueries({ queryKey: getShoppingListQueryOptions(listId).queryKey });
      const previous = queryClient.getQueryData(getShoppingListQueryOptions(listId).queryKey);

      applyItemPatch(queryClient, listId, itemId, { checkedAt: checked ? new Date().toISOString() : null });

      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(getShoppingListQueryOptions(listId).queryKey, context.previous);
      }
      toast.error(serverMessage(error, 'Could not update that item.'));
      // The snapshot predates any refetch that landed while the request was out, so rolling back can
      // bury another member's change.
      invalidateShoppingLists(queryClient);
    },
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

  /**
   * Removes a row and offers to put it back, the same trade the meal plan makes for a planned meal:
   * an item holds no content of its own, and every field needed to re-create it exactly — its slot
   * and whether it was already in the basket included — is on the row being removed.
   */
  const removeItemWithUndo = async (item: ShoppingListItem) => {
    let detail: ShoppingListDetail;

    try {
      detail = await removeItem(item.id);
    } catch (error) {
      toast.error(serverMessage(error, 'Something went wrong.'));

      return;
    }

    // Removing the last row under a heading takes the heading with it, so its id is already dead.
    // Omitting it lets the ingredient's shop resolve a section again — which mints the same heading
    // back — where sending the stale id would 404 and lose the row for good.
    // `null` is the ungrouped bucket, which is a real placement rather than a heading and survives.
    const section =
      item.sectionId === null || detail.sections.some((row) => row.id === item.sectionId) ? item.sectionId : undefined;

    toast.success(`Removed "${item.label}"`, {
      action: {
        label: 'Undo',
        onClick: () =>
          void addItemOrToast({
            checked: item.checkedAt !== null,
            ingredientId: item.ingredientId ?? undefined,
            note: item.note ?? '',
            position: item.position,
            quantity: item.quantity,
            sectionId: section,
            // A named ingredient has no title of its own — its label comes off the join.
            title: item.ingredientId === null ? item.label : undefined,
            unit: item.unit,
          }),
      },
    });
  };

  const moveItemOrToast = async (move: { itemId: number; position: number; sectionId?: number | null }) => {
    try {
      await moveItem(move);
    } catch (error) {
      toast.error(serverMessage(error, 'Could not move that item.'));
      invalidateShoppingLists(queryClient);
    }
  };

  return { addItemOrToast, isAdding, moveItemOrToast, removeItemWithUndo, saveItem, saveItemOrToast, toggleChecked };
}

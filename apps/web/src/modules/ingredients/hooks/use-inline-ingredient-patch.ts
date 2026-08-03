import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type InferRequestType } from 'hono';
import { toast } from 'sonner';

import { client, parseResponse } from '@/api/client';
import { serverMessage } from '@/modules/shared';
import { invalidateStores } from '@/modules/stores';

import { applyIngredientUpdate, invalidateIngredients } from '../ingredients.queries';

const $patchIngredient = client.ingredients[':id'].$patch;

export type PatchIngredientPayload = InferRequestType<typeof $patchIngredient>['json'];

/**
 * Saves one field of one ingredient, for the cells that edit in place with no form around them.
 *
 * The response carries the updated row, so it goes into the cache before the invalidation's refetch
 * lands — a cell that kept showing its old value for a round trip would defeat the point of editing
 * in the table rather than in the dialog.
 */
export function useInlineIngredientPatch(ingredientId: number) {
  const queryClient = useQueryClient();

  const { isPending, mutateAsync: save } = useMutation({
    mutationFn: async (json: PatchIngredientPayload) =>
      parseResponse($patchIngredient({ param: { id: ingredientId.toString() }, json })),
    onSuccess: (updated, json) => {
      applyIngredientUpdate(queryClient, updated);
      invalidateIngredients(queryClient);

      // Naming a shop found-or-creates it as part of the same write, so the shop list may have grown.
      // The pickers happen to recover without this today — they mount their query fresh each time
      // the popover opens, and `staleTime` is 0 — but that's a property of the query config, not of
      // this write being announced. Say what changed rather than leaning on it.
      if (json.storeName) {
        invalidateStores(queryClient);
      }
    },
  });

  /**
   * For controls with nowhere to put an error: a select has no field to hang a message on, so a
   * failure toasts and the cell falls back to the server's value on the next render. Callers that do
   * have a field — the name editor and its 409 — use `save` and handle the rejection themselves.
   */
  const saveOrToast = async (json: PatchIngredientPayload) => {
    try {
      await save(json);
    } catch (error) {
      toast.error(serverMessage(error, 'Something went wrong.'));
    }
  };

  return { isPending, save, saveOrToast };
}

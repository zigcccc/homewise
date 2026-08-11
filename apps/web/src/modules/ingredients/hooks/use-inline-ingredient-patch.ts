import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type InferRequestType } from 'hono';

import { client, parseResponse } from '@/api/client';
import { useInlinePatch } from '@/modules/shared';
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

  return useInlinePatch(
    useMutation({
      mutationFn: async (json: PatchIngredientPayload) =>
        parseResponse($patchIngredient({ param: { id: ingredientId.toString() }, json })),
      onSuccess: (updated, json) => {
        applyIngredientUpdate(queryClient, updated);
        invalidateIngredients(queryClient);

        // Naming a shop found-or-creates it as part of the same write, so the list may have grown.
        if (json.storeName) {
          invalidateStores(queryClient);
        }
      },
    })
  );
}

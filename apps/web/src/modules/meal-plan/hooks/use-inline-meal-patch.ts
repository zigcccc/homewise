import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type InferRequestType } from 'hono';

import { parseResponse } from '@/api/client';
import { useInlinePatch } from '@/modules/shared';

import { $patchMeal, applyMealUpdate, invalidateMealPlan } from '../meal-plan.queries';

export type PatchMealPayload = InferRequestType<typeof $patchMeal>['json'];

/**
 * Saves one field of one planned meal, for the controls that edit in place.
 *
 * The response carries the updated meal, so it goes into the cache before the invalidation's refetch
 * lands — a card that kept showing its old label for a round trip would defeat the point of editing
 * on the card rather than in a dialog.
 *
 * Takes the id once, at mount. That's deliberate: realtime refetches the list underneath an open
 * editor, and a meal can change day mid-edit when another member drags it, so a save must address
 * the meal the editor was opened on rather than whatever now occupies its position.
 */
export function useInlineMealPatch(mealId: number) {
  const queryClient = useQueryClient();

  return useInlinePatch(
    useMutation({
      mutationFn: async (json: PatchMealPayload) =>
        parseResponse($patchMeal({ param: { id: mealId.toString() }, json })),
      onSuccess: (updated) => {
        applyMealUpdate(queryClient, updated);
        invalidateMealPlan(queryClient);
      },
    })
  );
}

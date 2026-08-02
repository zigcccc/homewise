import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type InferRequestType } from 'hono';
import { toast } from 'sonner';

import { parseResponse } from '@/api/client';
import { serverMessage } from '@/modules/shared';

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

  const { isPending, mutateAsync: save } = useMutation({
    mutationFn: async (json: PatchMealPayload) => parseResponse($patchMeal({ param: { id: mealId.toString() }, json })),
    onSuccess: (updated) => {
      applyMealUpdate(queryClient, updated);
      invalidateMealPlan(queryClient);
    },
  });

  /**
   * For controls with nowhere to put an error — the member popover has no field to hang a message
   * on, so a failure toasts and the control falls back to the server's value on the next render.
   * The text editors use `save` and let `InlineTextField` handle the rejection.
   */
  const saveOrToast = async (json: PatchMealPayload) => {
    try {
      await save(json);
    } catch (error) {
      toast.error(serverMessage(error, 'Something went wrong.'));
    }
  };

  return { isPending, save, saveOrToast };
}

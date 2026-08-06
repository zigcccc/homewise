import { move } from '@dnd-kit/helpers';
import { type DragEndEvent } from '@dnd-kit/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { parseResponse } from '@/api/client';
import { serverMessage } from '@/modules/shared';

import { resolveMealMove } from '../meal-plan.helpers';
import {
  $patchMeal,
  invalidateMealPlan,
  type MealPlanDay,
  mealPlanRangeQueryOptions,
  moveMealInRange,
} from '../meal-plan.queries';

/**
 * Moving a meal to another day, both ways it can happen: dragging the card, and the "move to" action
 * in its menu. Owns the optimistic cache write and its rollback, so the route hands `onDragEnd`
 * straight to `DragDropProvider` and calls `moveMeal` from the menu without carrying any of the
 * bookkeeping itself.
 *
 * Unlike `useItemDrag` there is no mid-drag arrangement state here: a meal moves between days rather
 * than between two independently-ordered panes, so the `onMutate` cache write is enough to keep
 * React's order in step with the node dnd-kit has already moved.
 */
export function useMealMove(range: { from: string; to: string }, days: MealPlanDay[]) {
  const queryClient = useQueryClient();

  const moveMeal = useMutation({
    mutationFn: async ({ id, position, toDay }: { id: number; position?: number; toDay: string }) =>
      parseResponse($patchMeal({ param: { id: String(id) }, json: { day: toDay, position } })),

    async onMutate(variables) {
      const key = mealPlanRangeQueryOptions(range).queryKey;
      await queryClient.cancelQueries({ queryKey: key });

      const previous = queryClient.getQueryData(key);

      queryClient.setQueryData(key, (old) => (old ? moveMealInRange(old, variables) : old));

      return { key, previous };
    },
    onError: (error, _variables, context) => {
      if (context) {
        queryClient.setQueryData(context.key, context.previous);
      }
      toast.error(serverMessage(error, 'Could not move that meal.'));
    },
    onSettled: () => invalidateMealPlan(queryClient),
  });

  const onDragEnd = (event: DragEndEvent) => {
    const draggedId = event.operation.source?.id;

    if (event.canceled || draggedId === undefined) {
      return;
    }

    const before: Record<string, number[]> = Object.fromEntries(
      days.map((day) => [day.day, day.meals.map((meal) => meal.id)])
    );
    const moved = resolveMealMove(days, move(before, event), Number(draggedId));

    if (moved) {
      moveMeal.mutate({ id: Number(draggedId), ...moved });
    }
  };

  return { moveMeal: moveMeal.mutate, onDragEnd };
}

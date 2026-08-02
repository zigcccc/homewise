import { type QueryClient, queryOptions } from '@tanstack/react-query';
import { type InferResponseType } from 'hono';

import { client, parseResponse } from '@/api/client';

const $readRange = client['meal-plan'].$get;
const $createMeal = client['meal-plan'].meals.$post;
const $patchMeal = client['meal-plan'].meals[':id'].$patch;
const $deleteMeal = client['meal-plan'].meals[':id'].$delete;
const $putDayNote = client['meal-plan'].days[':day'].$put;

export type MealPlanRange = InferResponseType<typeof $readRange, 200>;
export type PlannedMeal = MealPlanRange['meals'][number];

/**
 * What the meal dialog needs of a recipe and of a member — derived from the responses that feed it,
 * so neither can drift from the server contract.
 */
export type RecipeOption = InferResponseType<typeof client.recipes.$get, 200>[number];
export type MemberOption = NonNullable<InferResponseType<typeof client.households.my.$get>>['members'][number];

/**
 * One day with its meals attached.
 *
 * The server sends the dense day list and the meals side by side rather than nested — see the note
 * on `MealPlanRangeResponse` — so this is where the two are stitched back together for rendering.
 */
export type MealPlanDay = MealPlanRange['days'][number] & { meals: PlannedMeal[] };

export function toDaysWithMeals(range: MealPlanRange): MealPlanDay[] {
  const byDay = new Map<string, PlannedMeal[]>();

  for (const meal of range.meals) {
    const forDay = byDay.get(meal.day) ?? [];
    forDay.push(meal);
    byDay.set(meal.day, forDay);
  }

  return range.days.map((day) => ({ ...day, meals: byDay.get(day.day) ?? [] }));
}

export { $createMeal, $deleteMeal, $patchMeal, $putDayNote };

export function mealPlanRangeQueryOptions(query: { from: string; to: string }) {
  return queryOptions({
    queryKey: ['meal-plan', 'range', query],
    queryFn: async () => parseResponse($readRange({ query })),
  });
}

/**
 * Every window at once.
 *
 * A change carries no clue which ranges it fell inside — the cache is keyed by `from`/`to`, and one
 * meal can appear in a 1-week, a 2-week and a 4-week view simultaneously. Only mounted queries
 * actually refetch, so the breadth costs nothing.
 */
export function invalidateMealPlan(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ['meal-plan'] });
}

/**
 * Swaps an updated meal into every cached window. A PATCH returns the meal it wrote, so an inline
 * edit shows its new value immediately instead of holding the old one for a full round trip — which
 * is the entire point of editing on the card.
 *
 * `setQueriesData` over the prefix, not `setQueryData`: one meal appears in the 1-, 2- and 4-week
 * caches at once, and fixing only the window you're looking at leaves its siblings stale. Pair it
 * with `invalidateMealPlan` — this fixes the card, the refetch fixes anything that moved.
 */
export function applyMealUpdate(queryClient: QueryClient, updated: PlannedMeal) {
  queryClient.setQueriesData<MealPlanRange>({ queryKey: ['meal-plan', 'range'] }, (range) =>
    range ? { ...range, meals: range.meals.map((meal) => (meal.id === updated.id ? updated : meal)) } : range
  );
}

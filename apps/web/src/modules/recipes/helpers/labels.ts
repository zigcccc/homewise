import { type MealType } from '@homewise/server/recipes';

/** Human-readable labels for the recipe `mealType` enum. */
export const mealTypeLabels: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  dessert: 'Dessert',
  snack: 'Snack',
  drink: 'Drink',
  side: 'Side',
  baking: 'Baking',
};

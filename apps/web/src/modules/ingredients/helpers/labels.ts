import { type IngredientCategory, type MeasurementUnit } from '@homewise/server/ingredients';

/** Human-readable labels for the ingredient `category` enum — the supermarket aisle. */
export const ingredientCategoryLabels: Record<IngredientCategory, string> = {
  produce: 'Produce',
  meat_fish: 'Meat & fish',
  dairy_eggs: 'Dairy & eggs',
  bakery: 'Bakery',
  pantry: 'Pantry',
  frozen: 'Frozen',
  spices: 'Spices',
  drinks: 'Drinks',
  household: 'Household',
  other: 'Other',
};

/** Short display forms for the `unit` enum — these sit next to a number, so they stay abbreviated. */
export const measurementUnitLabels: Record<MeasurementUnit, string> = {
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'l',
  tsp: 'tsp',
  tbsp: 'tbsp',
  cup: 'cup',
  piece: 'pc',
  slice: 'slice',
  clove: 'clove',
  pinch: 'pinch',
  can: 'can',
  pack: 'pack',
  bunch: 'bunch',
};

/**
 * Renders a quantity + unit the way a recipe reads. A line with no quantity is "to taste" rather
 * than a blank cell, and `piece` is implied by the number alone ("3 eggs", not "3 pc eggs").
 */
export function formatQuantity(quantity: number | null, unit: MeasurementUnit | null) {
  if (quantity === null) {
    return unit ? measurementUnitLabels[unit] : 'to taste';
  }

  // Trim trailing zeros from the numeric(10,3) column: 1.500 reads as 1.5, 2.000 as 2.
  const amount = String(Number(quantity.toFixed(3)));

  if (!unit || unit === 'piece') {
    return amount;
  }

  return `${amount} ${measurementUnitLabels[unit]}`;
}

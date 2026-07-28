import z from 'zod';

/** Aisle categories, mirrored from the DB enum. Reused by the web for labels and selects. */
export const ingredientCategory = z.enum([
  'produce',
  'meat_fish',
  'dairy_eggs',
  'bakery',
  'pantry',
  'frozen',
  'spices',
  'drinks',
  'household',
  'other',
]);
export type IngredientCategory = z.infer<typeof ingredientCategory>;

/**
 * Measurement units, mirrored from the DB enum. Lives here rather than in the recipes module
 * because the unit belongs to the ingredient vocabulary — recipes and, later, shopping lists both
 * import it from here.
 */
export const measurementUnit = z.enum([
  'g',
  'kg',
  'ml',
  'l',
  'tsp',
  'tbsp',
  'cup',
  'piece',
  'slice',
  'clove',
  'pinch',
  'can',
  'pack',
  'bunch',
]);
export type MeasurementUnit = z.infer<typeof measurementUnit>;

const name = (model: z.ZodString) =>
  model
    .trim()
    .min(1, { error: 'Name must contain at least 1 character' })
    .max(96, { error: 'Name must contain at most 96 characters' });

/**
 * The name bounds on their own, exported so a recipe line can carry a not-yet-created ingredient by
 * name and still be validated identically to one created through `POST /ingredients`.
 */
export const ingredientName = name(z.string());

/** Free-text optional field: trims, caps length, and treats an empty string as "cleared". */
const notes = z
  .string()
  .trim()
  .max(500, { error: 'Notes must contain at most 500 characters' })
  .or(z.literal(''))
  .optional();

/** `null` clears the default unit; omitting the key leaves it untouched. */
const defaultUnit = measurementUnit.nullish();

export const createIngredientModel = z.object({
  name: name(z.string()),
  category: ingredientCategory.default('other'),
  defaultUnit,
  notes,
});
export type CreateIngredient = z.infer<typeof createIngredientModel>;

export const patchIngredientModel = z.object({
  name: name(z.string()).optional(),
  category: ingredientCategory.optional(),
  defaultUnit,
  notes,
});
export type PatchIngredient = z.infer<typeof patchIngredientModel>;

export const ingredientPathParamsModel = z.object({ id: z.coerce.number<number>().int().positive() });

export const ingredientSortKey = z.enum(['name', 'category', 'createdAt']);
export type IngredientSortKey = z.infer<typeof ingredientSortKey>;

export const ingredientSortDirection = z.enum(['asc', 'desc']);
export type IngredientSortDirection = z.infer<typeof ingredientSortDirection>;

export const listIngredientsQueryParamsModel = z.object({
  /** Case-insensitive substring match across the name and the notes. */
  search: z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : value))
    .optional()
    .catch(undefined),
  category: ingredientCategory.optional().catch(undefined),
  sortKey: ingredientSortKey.default('name').catch('name'),
  sortDirection: ingredientSortDirection.default('asc').catch('asc'),
});
export type ListIngredientsQueryParams = z.infer<typeof listIngredientsQueryParamsModel>;

import z from 'zod';

import { optionalText } from '@/lib/models';
import { ingredientName, measurementUnit } from '@/modules/ingredients/models';

/** Meal types, mirrored from the DB enum. Reused by the web for labels and selects. */
export const mealType = z.enum(['breakfast', 'lunch', 'dinner', 'dessert', 'snack', 'drink', 'side', 'baking']);
export type MealType = z.infer<typeof mealType>;

const title = (model: z.ZodString) =>
  model
    .trim()
    .min(1, { error: 'Title must contain at least 1 character' })
    .max(160, { error: 'Title must contain at most 160 characters' });

/** Friendly URL: trims, prepends `https://` when no scheme is given, then validates. Empty clears. */
const sourceUrl = z
  .string()
  .trim()
  .max(2048, { error: 'URL must contain at most 2048 characters' })
  .transform((value) => (value === '' || /^https?:\/\//i.test(value) ? value : `https://${value}`))
  .pipe(z.url({ error: 'Enter a valid URL' }).or(z.literal('')))
  .optional();

/** `null` clears the value; omitting the key leaves it untouched. */
const positiveCount = (max: number, label: string) =>
  z
    .number()
    .int({ error: `${label} must be a whole number` })
    .positive({ error: `${label} must be greater than 0` })
    .max(max, { error: `${label} must be at most ${max}` })
    .nullish();

const minutes = (label: string) =>
  z
    .number()
    .int({ error: `${label} must be a whole number` })
    .nonnegative({ error: `${label} cannot be negative` })
    .max(10_000, { error: `${label} must be at most 10000` })
    .nullish();

/**
 * One line of the ingredient list. `position` is derived from the array order on the server — the
 * client never sends it, so reordering is just reordering the array.
 *
 * A line points at the library either by id or by name. The name form is how an ingredient typed
 * into the recipe form gets created: it is found-or-created inside the save transaction, exactly
 * like `tags`, so nothing lands in the library until the recipe itself is saved.
 */
export const recipeIngredientModel = z
  .object({
    /** An existing row in the household's ingredient library. */
    ingredientId: z.number().int().positive().optional(),
    /** A name to find-or-create at save time. Mutually exclusive with `ingredientId`. */
    ingredientName: ingredientName.optional(),
    /** `null` means "to taste". */
    quantity: z
      .number()
      .positive({ error: 'Quantity must be greater than 0' })
      .max(100_000, { error: 'Quantity must be at most 100000' })
      .nullish(),
    unit: measurementUnit.nullish(),
    note: optionalText(128, 'Note'),
    section: optionalText(64, 'Section'),
  })
  .refine((line) => (line.ingredientId === undefined) !== (line.ingredientName === undefined), {
    error: 'Pick an ingredient or give it a name',
    path: ['ingredientName'],
  });
export type RecipeIngredient = z.infer<typeof recipeIngredientModel>;

export const recipeStepModel = z.object({
  instruction: z
    .string()
    .trim()
    .min(1, { error: 'A step cannot be empty' })
    .max(2000, { error: 'A step must contain at most 2000 characters' }),
});
export type RecipeStep = z.infer<typeof recipeStepModel>;

/** Ingredient lines, capped so a recipe can't accumulate an unbounded list. */
const ingredients = z
  .array(recipeIngredientModel)
  .max(100, { error: 'A recipe can have at most 100 ingredients' })
  .optional();

const steps = z.array(recipeStepModel).max(100, { error: 'A recipe can have at most 100 steps' }).optional();

/** Tags arrive as names and are found-or-created per household — there is no tag id to look up first. */
const tags = z
  .array(
    z
      .string()
      .trim()
      .min(1, { error: 'A tag cannot be empty' })
      .max(32, { error: 'A tag must contain at most 32 characters' })
  )
  .max(20, { error: 'A recipe can have at most 20 tags' })
  .optional();

export const createRecipeModel = z.object({
  title: title(z.string()),
  description: optionalText(2000, 'Description'),
  mealType: mealType.nullish(),
  cuisine: optionalText(64, 'Cuisine'),
  servings: positiveCount(100, 'Servings'),
  prepTimeMinutes: minutes('Prep time'),
  cookTimeMinutes: minutes('Cook time'),
  sourceName: optionalText(160, 'Source'),
  sourceUrl,
  ingredients,
  steps,
  tags,
});
export type CreateRecipe = z.infer<typeof createRecipeModel>;

export const patchRecipeModel = z.object({
  title: title(z.string()).optional(),
  description: optionalText(2000, 'Description'),
  mealType: mealType.nullish(),
  cuisine: optionalText(64, 'Cuisine'),
  servings: positiveCount(100, 'Servings'),
  prepTimeMinutes: minutes('Prep time'),
  cookTimeMinutes: minutes('Cook time'),
  sourceName: optionalText(160, 'Source'),
  sourceUrl,
  isFavorite: z.boolean().optional(),
  archived: z.boolean().optional(),
  ingredients,
  steps,
  tags,
});
export type PatchRecipe = z.infer<typeof patchRecipeModel>;

export const recipePathParamsModel = z.object({ id: z.coerce.number<number>().int().positive() });

export const recipeTagPathParamsModel = z.object({ tagId: z.coerce.number<number>().int().positive() });

export const recipeSortKey = z.enum(['title', 'createdAt', 'updatedAt']);
export type RecipeSortKey = z.infer<typeof recipeSortKey>;

export const recipeSortDirection = z.enum(['asc', 'desc']);
export type RecipeSortDirection = z.infer<typeof recipeSortDirection>;

export const listRecipesQueryParamsModel = z.object({
  /** Case-insensitive match across the title, description, cuisine — and the ingredients it uses. */
  search: z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : value))
    .optional()
    .catch(undefined),
  mealType: mealType.optional().catch(undefined),
  tagId: z.coerce.number<number>().int().positive().optional().catch(undefined),
  favoritesOnly: z.stringbool().default(false).catch(false),
  includeArchived: z.stringbool().default(false).catch(false),
  sortKey: recipeSortKey.default('title').catch('title'),
  sortDirection: recipeSortDirection.default('asc').catch('asc'),
});
export type ListRecipesQueryParams = z.infer<typeof listRecipesQueryParamsModel>;

import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import z from 'zod';

import * as schema from '#db/schema/core';
import { dbOwnedColumns, optionalText, pagedQueryParams, searchQueryParam, sortDirection } from '#lib/models';

/** Aisle categories, straight off the DB enum. Reused by the web for labels and selects. */
export const ingredientCategory = createSelectSchema(schema.ingredientCategoryEnum);
export type IngredientCategory = z.infer<typeof ingredientCategory>;

/**
 * Measurement units, straight off the DB enum. Lives here rather than in the recipes module because
 * the unit belongs to the ingredient vocabulary — recipes and shopping lists both import it from here.
 */
export const measurementUnit = createSelectSchema(schema.measurementUnitEnum);
export type MeasurementUnit = z.infer<typeof measurementUnit>;

/**
 * The name bounds on their own, exported so a recipe line can carry a not-yet-created ingredient by
 * name and still be validated identically to one created through `POST /ingredients`.
 */
export const ingredientName = z
  .string()
  .trim()
  .min(1, { error: 'Name must contain at least 1 character' })
  .max(96, { error: 'Name must contain at most 96 characters' });

/**
 * A shop to file this under **by name**, found-or-created as part of the same write. Not a column —
 * it resolves to `storeId`, which it takes precedence over, so a form can offer "create it on the fly"
 * without making the user leave and add the shop first, and without minting one when they abandon it.
 */
const storeName = ingredientName.optional();

/** `notes` is text a form clears with `''`; `storeName` is resolved to `storeId`, not stored. */
const ingredientPayloadFields = { notes: optionalText(500, 'Notes'), storeName };

export const createIngredientModel = createInsertSchema(schema.ingredient, { name: () => ingredientName })
  .omit(dbOwnedColumns)
  /** `null` clears the default unit or the shop; omitting the key leaves it untouched. */
  .partial({ defaultUnit: true, storeId: true })
  .extend({
    ...ingredientPayloadFields,
    // Restated rather than left to the column's own default, so the parsed payload carries a category
    // whether or not one was sent — the web reads this back as the form's default.
    category: ingredientCategory.default('other'),
  });
export type CreateIngredient = z.infer<typeof createIngredientModel>;

export const patchIngredientModel = createUpdateSchema(schema.ingredient, { name: () => ingredientName })
  .omit(dbOwnedColumns)
  .extend(ingredientPayloadFields);
export type PatchIngredient = z.infer<typeof patchIngredientModel>;

export const ingredientPathParamsModel = z.object({ id: z.coerce.number<number>().int().positive() });

export const ingredientSortKey = z.enum(['name', 'category', 'createdAt']);
export type IngredientSortKey = z.infer<typeof ingredientSortKey>;

export const listIngredientsQueryParamsModel = z.object({
  /** Matched against the name and the notes both. */
  search: searchQueryParam,
  category: ingredientCategory.optional().catch(undefined),
  /** Narrows to one shop. `none` is its own filter: the ingredients with no shop assigned yet. */
  store: z
    .union([z.literal('none'), z.coerce.number<number>().int().positive()])
    .optional()
    .catch(undefined),
  sortKey: ingredientSortKey.default('name').catch('name'),
  sortDirection: sortDirection.default('asc').catch('asc'),
  ...pagedQueryParams.shape,
});
export type ListIngredientsQueryParams = z.infer<typeof listIngredientsQueryParamsModel>;

import z from 'zod';

import { measurementUnit } from '@/modules/ingredients/models';

/** Shown when a list has a label but nothing to infer one from. */
export const UNTITLED_LIST_LABEL = 'Shopping list';

/** Surfaced on the field the form can act on, the way `MEAL_LABEL_ERROR` is on the meal plan. */
export const ITEM_LABEL_ERROR = 'Pick an ingredient or give the item a name';

const boundedName = (max: number) =>
  z
    .string()
    .trim()
    .min(1, { error: 'Name must contain at least 1 character' })
    .max(max, { error: `Name must contain at most ${max} characters` });

/** Exported bare, so an inline editor validates against the same contract the endpoint does. */
export const shoppingListName = boundedName(96);
export const shoppingListSectionName = boundedName(96);
export const shoppingListItemTitle = boundedName(160);

const listName = shoppingListName;
const sectionName = shoppingListSectionName;
const itemTitle = shoppingListItemTitle;

const note = z
  .string()
  .trim()
  .max(500, { error: 'Note must contain at most 500 characters' })
  .or(z.literal(''))
  .optional();

/** NULL is "however much" — the common case for bread. Bounded so a typo can't overflow the column. */
const quantity = z.number().positive().max(1_000_000).nullish();
const id = z.number().int().positive();

/** Optional, and expected to stay empty — a list is normally labelled from its sections. */
export const createShoppingListModel = z.object({ name: listName.optional() });
export type CreateShoppingList = z.infer<typeof createShoppingListModel>;

/** `null` clears the name and hands labelling back to the sections. */
export const patchShoppingListModel = z.object({ name: listName.nullish() });
export type PatchShoppingList = z.infer<typeof patchShoppingListModel>;

/**
 * What to do with the items still unticked when a list is marked done. `discard` completes the list
 * as-is; `carry-over` moves them to a fresh list first, sections and all, so a forgotten item isn't
 * silently lost with the trip it belonged to.
 */
export const completeShoppingListModel = z.object({
  unchecked: z.enum(['discard', 'carry-over']).default('discard'),
});
export type CompleteShoppingList = z.infer<typeof completeShoppingListModel>;

export const createSectionModel = z.object({ name: sectionName });
export type CreateSection = z.infer<typeof createSectionModel>;

export const patchSectionModel = z.object({ name: sectionName.optional() });
export type PatchSection = z.infer<typeof patchSectionModel>;

const itemFields = {
  /** An existing library row. Mutually exclusive with `title` in practice; `ingredientId` wins. */
  ingredientId: id.optional(),
  /** A one-off nobody wants in the ingredient library — batteries, a birthday card. */
  title: itemTitle.optional(),
  quantity,
  unit: measurementUnit.nullish(),
  note,
  /** Omit to let the ingredient's shop decide; `null` forces it ungrouped. */
  sectionId: id.nullish(),
};

export const createItemModel = z
  .object(itemFields)
  .refine((data) => data.ingredientId !== undefined || data.title !== undefined, {
    error: ITEM_LABEL_ERROR,
    path: ['title'],
  });
export type CreateItem = z.infer<typeof createItemModel>;

/**
 * No `ingredientId`: what an item *is* doesn't change, only its amounts, placement and whether it's
 * in the basket. Swapping the ingredient would be a different item.
 *
 * No `.refine` for the label either — an item already has one, and `title` here only renames a
 * free-text line.
 */
export const patchItemModel = z.object({
  title: itemTitle.optional(),
  quantity,
  unit: measurementUnit.nullish(),
  note,
  sectionId: id.nullish(),
  /** The API is a boolean; the storage is a timestamp plus who ticked it. */
  checked: z.boolean().optional(),
});
export type PatchItem = z.infer<typeof patchItemModel>;

export const shoppingListPathParamsModel = z.object({ id: z.coerce.number<number>().int().positive() });
export const sectionPathParamsModel = z.object({
  id: z.coerce.number<number>().int().positive(),
  sectionId: z.coerce.number<number>().int().positive(),
});
export const itemPathParamsModel = z.object({
  id: z.coerce.number<number>().int().positive(),
  itemId: z.coerce.number<number>().int().positive(),
});

export const listShoppingListsQueryParamsModel = z.object({
  /** Completed lists are hidden by default — the useful list is the one you haven't shopped yet. */
  includeCompleted: z
    .enum(['true', 'false'])
    .default('false')
    .catch('false')
    .transform((value) => value === 'true'),
});
export type ListShoppingListsQueryParams = z.infer<typeof listShoppingListsQueryParamsModel>;

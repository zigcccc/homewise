import { createInsertSchema, createUpdateSchema } from 'drizzle-zod';
import z from 'zod';

import * as schema from '#db/schema/core';
import { dbOwnedColumns } from '#lib/models';
import { measurementUnit } from '#modules/ingredients/ingredients.model';

/** Shown when a list has a label but nothing to infer one from. */
export const UNTITLED_LIST_LABEL = 'Shopping list';

/** Surfaced on the field the form can act on, the way `MEAL_LABEL_ERROR` is on the meal plan. */
export const ITEM_LABEL_ERROR = 'Pick an ingredient or give the item a name';

/** Exported bare, so an inline editor validates against the same contract the endpoint does. */
export const shoppingListName = z
  .string()
  .trim()
  .min(1, { error: 'Name must contain at least 1 character' })
  .max(96, { error: 'Name must contain at most 96 characters' });

export const shoppingListSectionName = z
  .string()
  .trim()
  .min(1, { error: 'Name must contain at least 1 character' })
  .max(96, { error: 'Name must contain at most 96 characters' });

export const shoppingListItemTitle = z
  .string()
  .trim()
  .min(1, { error: 'Name must contain at least 1 character' })
  .max(160, { error: 'Name must contain at most 160 characters' });

const note = z
  .string()
  .trim()
  .max(500, { error: 'Note must contain at most 500 characters' })
  .or(z.literal(''))
  .optional();

/** NULL is "however much" — the common case for bread. Bounded so a typo can't overflow the column. */
const quantity = z.number().positive().max(1_000_000).nullish();
const id = z.number().int().positive();

/** `completedAt` is stamped by the complete endpoint below, and `createdBy` comes off the session. */
const serverOwnedListColumns = { ...dbOwnedColumns, completedAt: true, createdBy: true } as const;

/** Optional, and expected to stay empty — a list is normally labelled from its sections. */
export const createShoppingListModel = createInsertSchema(schema.shoppingList)
  .omit(serverOwnedListColumns)
  .extend({ name: shoppingListName.optional() });
export type CreateShoppingList = z.infer<typeof createShoppingListModel>;

/** `null` clears the name and hands labelling back to the sections. */
export const patchShoppingListModel = createUpdateSchema(schema.shoppingList, {
  name: () => shoppingListName,
}).omit(serverOwnedListColumns);
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

/** `storeId` is inherited from the ingredients filed here, and `position` is the service's to assign. */
const serverOwnedSectionColumns = {
  createdAt: true,
  id: true,
  position: true,
  shoppingListId: true,
  storeId: true,
  updatedAt: true,
} as const;

// The column is nullable — a section written by the importer takes its name from the shop — but one
// the user touches has nothing else to call itself, so neither endpoint lets them clear it.
export const createSectionModel = createInsertSchema(schema.shoppingListSection)
  .omit(serverOwnedSectionColumns)
  .extend({ name: shoppingListSectionName });
export type CreateSection = z.infer<typeof createSectionModel>;

export const patchSectionModel = createUpdateSchema(schema.shoppingListSection)
  .omit(serverOwnedSectionColumns)
  .extend({ name: shoppingListSectionName.optional() });
export type PatchSection = z.infer<typeof patchSectionModel>;

/**
 * An item payload is a *command*, not a row: `checked` drives the stored `checkedAt`/`checkedBy` pair
 * and `position` drives a resequence of its section. Nothing here would come out of the table, so
 * these two stay hand-written — unlike every model above, which is the row it writes.
 */
const itemFields = {
  /** An existing library row. Mutually exclusive with `title` in practice; `ingredientId` wins. */
  ingredientId: id.optional(),
  /** A one-off nobody wants in the ingredient library — batteries, a birthday card. */
  title: shoppingListItemTitle.optional(),
  quantity,
  unit: measurementUnit.nullish(),
  note,
  /** Omit to let the ingredient's shop decide; `null` forces it ungrouped. */
  sectionId: id.nullish(),
  /** Where in its section to land. Omit to append — only an Undo knows the slot a row came from. */
  position: z.number().int().min(0).optional(),
  /** Only an Undo sends this: a row that was already in the basket goes back ticked. */
  checked: z.boolean().optional(),
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
  title: shoppingListItemTitle.optional(),
  quantity,
  unit: measurementUnit.nullish(),
  note,
  sectionId: id.nullish(),
  /** Where in its section to land. Omit to append — a drop knows the index, a menu move doesn't. */
  position: z.number().int().min(0).optional(),
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

/**
 * How far ahead an import looks by default. A week from today, not the current ISO week: you shop
 * for the days coming, and on a Saturday "this week" is mostly behind you.
 */
export const IMPORT_DEFAULT_DAYS = 7;

export const mealPlanPreviewQueryParamsModel = z.object({
  from: z.iso.date().optional().catch(undefined),
  to: z.iso.date().optional().catch(undefined),
});
export type MealPlanPreviewQueryParams = z.infer<typeof mealPlanPreviewQueryParamsModel>;

/**
 * One line the user ticked in the preview. The amounts come back from the preview rather than being
 * recomputed here, so what lands on the list is exactly what was on screen — more than one only when
 * the recipes called for units that don't add up, which the service writes into the item's note.
 */
const importLineModel = z.object({
  ingredientId: id,
  // Both keys required, values nullable — the shape the preview hands back, so a line can round-trip
  // unchanged rather than being reassembled on the way in.
  amounts: z
    .array(
      z.object({
        quantity: z.number().positive().max(1_000_000).nullable(),
        unit: measurementUnit.nullable(),
      })
    )
    .min(1)
    .max(8),
});

export const importFromMealPlanModel = z.object({
  /** Omit to start a new list; name it too, if the new list should carry one. */
  listId: id.optional(),
  name: shoppingListName.optional(),
  lines: z.array(importLineModel).min(1, { error: 'Pick at least one thing to add' }).max(200),
});
export type ImportFromMealPlan = z.infer<typeof importFromMealPlanModel>;

export const listShoppingListsQueryParamsModel = z.object({
  /** Completed lists are hidden by default — the useful list is the one you haven't shopped yet. */
  includeCompleted: z
    .enum(['true', 'false'])
    .default('false')
    .catch('false')
    .transform((value) => value === 'true'),
});
export type ListShoppingListsQueryParams = z.infer<typeof listShoppingListsQueryParamsModel>;

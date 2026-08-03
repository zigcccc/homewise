import { relations, sql } from 'drizzle-orm';
import { check, index, integer, numeric, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { baseDbEntityFields } from './__shared/base';
import { household } from './household';
import { ingredient, measurementUnitEnum } from './recipe';
import { store } from './store';
import { user } from './user';

/**
 * One shopping trip's worth of things to buy, ticked off as they go in the basket.
 *
 * `name` is optional and expected to stay empty most of the time — a list is identified by where you
 * are going, which the service infers from its sections ("Spar, Hofer, and 1 other"). Naming one is
 * for the exceptions: "Christmas dinner", "camping".
 *
 * `completedAt` rather than a boolean: "when did we last do the big shop" is a question the timestamp
 * can answer and a flag can't, and it costs nothing to record.
 */
export const shoppingList = pgTable(
  'shopping_list',
  {
    ...baseDbEntityFields,
    householdId: integer('household_id')
      .notNull()
      .references(() => household.id, { onDelete: 'cascade' }),
    /** Optional. When NULL the list is labelled from its sections. */
    name: text('name'),
    /** NULL while the list is still being shopped. */
    completedAt: timestamp('completed_at'),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  },
  // The list-for-a-household read is the only query this table serves, and it nearly always excludes
  // the completed ones.
  (table) => [index('shopping_list_household_idx').on(table.householdId, table.completedAt)]
);

/**
 * A heading within a list — in practice one shop, so a single trip's items read together.
 *
 * Labelled either by a shop (`storeId`, whose name is read live off the join so a rename relabels
 * every list) or by free text (`name`) — never neither, which is what the check enforces. The same
 * shape `planned_meal` uses for recipe-or-title, and it earns its keep the same way: deleting a shop
 * nulls the link, and `StoresService.delete` copies its name into `name` first, so the list keeps a
 * readable heading instead of a hole. Without that tombstone the check makes the delete fail, which
 * is the point — it can't be quietly forgotten.
 *
 * Items with no section are ungrouped rather than sitting in a catch-all row: a list that has never
 * met a shop should not sprout an "Other" heading to hold everything.
 */
export const shoppingListSection = pgTable(
  'shopping_list_section',
  {
    ...baseDbEntityFields,
    shoppingListId: integer('shopping_list_id')
      .notNull()
      .references(() => shoppingList.id, { onDelete: 'cascade' }),
    /** Set for a shop-backed section, so auto-placement can find it again. */
    storeId: integer('store_id').references(() => store.id, { onDelete: 'set null' }),
    /** Free-text heading, or the tombstoned shop name. NULL while a shop is attached. */
    name: text('name'),
    position: integer('position').notNull(),
  },
  (table) => [
    check('shopping_list_section_label_check', sql`${table.storeId} IS NOT NULL OR ${table.name} IS NOT NULL`),
    // One section per shop per list: adding a second Spar ingredient must find the existing heading,
    // not open a rival one. Partial, because the free-text sections all have a NULL storeId.
    uniqueIndex('shopping_list_section_store_unique')
      .on(table.shoppingListId, table.storeId)
      .where(sql`${table.storeId} IS NOT NULL`),
    uniqueIndex('shopping_list_section_name_unique')
      .on(table.shoppingListId, sql`lower(${table.name})`)
      .where(sql`${table.name} IS NOT NULL`),
    // Postgres doesn't index FK referencing columns; without this the SET NULL on a shop delete
    // sequentially scans every section ever made.
    index('shopping_list_section_store_idx').on(table.storeId),
  ]
);

/**
 * One thing to buy.
 *
 * Labelled either by a library ingredient (`ingredientId`) or by free text (`title`) — the free-text
 * half is the whole point of "a one-off we want to buy but never want in the ingredient library",
 * like batteries. Deleting an ingredient tombstones its name into `title` rather than being blocked:
 * unlike a recipe, a list is ephemeral, and refusing a library cleanup because of a six-month-old
 * completed list would be the wrong trade.
 *
 * `checkedAt`/`checkedBy` rather than a boolean, because two people shopping together both want to
 * see who already got the milk.
 */
export const shoppingListItem = pgTable(
  'shopping_list_item',
  {
    ...baseDbEntityFields,
    shoppingListId: integer('shopping_list_id')
      .notNull()
      .references(() => shoppingList.id, { onDelete: 'cascade' }),
    /** NULL is ungrouped — also where a deleted section's items land. */
    sectionId: integer('section_id').references(() => shoppingListSection.id, { onDelete: 'set null' }),
    ingredientId: integer('ingredient_id').references(() => ingredient.id, { onDelete: 'set null' }),
    /** A one-off the household doesn't want in the library, or the tombstoned ingredient name. */
    title: text('title'),
    /** NULL means "however much" — the common case for "bread". `mode: 'number'`, as drizzle returns
     *  numeric as a string otherwise. */
    quantity: numeric('quantity', { precision: 10, scale: 3, mode: 'number' }),
    unit: measurementUnitEnum(),
    /** About this line: "the big tub", "whichever is on offer". */
    note: text('note'),
    checkedAt: timestamp('checked_at'),
    checkedBy: text('checked_by').references(() => user.id, { onDelete: 'set null' }),
    /** Order within its section. No unique on `(sectionId, position)`, for the same reason
     *  `planned_meal.position` has none: re-sequencing writes rows one by one. */
    position: integer('position').notNull(),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  },
  (table) => [
    // Reading one whole list is the only query this table serves.
    index('shopping_list_item_list_idx').on(table.shoppingListId),
    index('shopping_list_item_ingredient_idx').on(table.ingredientId),
    check('shopping_list_item_label_check', sql`${table.ingredientId} IS NOT NULL OR ${table.title} IS NOT NULL`),
  ]
);

export const shoppingListRelations = relations(shoppingList, ({ many, one }) => ({
  /** Who started the list. Survives their account deletion as NULL. */
  creator: one(user, { fields: [shoppingList.createdBy], references: [user.id] }),
  household: one(household, { fields: [shoppingList.householdId], references: [household.id] }),
  items: many(shoppingListItem),
  sections: many(shoppingListSection),
}));

export const shoppingListSectionRelations = relations(shoppingListSection, ({ many, one }) => ({
  items: many(shoppingListItem),
  shoppingList: one(shoppingList, {
    fields: [shoppingListSection.shoppingListId],
    references: [shoppingList.id],
  }),
  /** The shop this heading stands for. Survives its deletion as NULL, name tombstoned into `name`. */
  store: one(store, { fields: [shoppingListSection.storeId], references: [store.id] }),
}));

export const shoppingListItemRelations = relations(shoppingListItem, ({ one }) => ({
  /** Who ticked it off. Survives their account deletion as NULL. */
  checker: one(user, { fields: [shoppingListItem.checkedBy], references: [user.id] }),
  creator: one(user, { fields: [shoppingListItem.createdBy], references: [user.id] }),
  ingredient: one(ingredient, { fields: [shoppingListItem.ingredientId], references: [ingredient.id] }),
  section: one(shoppingListSection, {
    fields: [shoppingListItem.sectionId],
    references: [shoppingListSection.id],
  }),
  shoppingList: one(shoppingList, { fields: [shoppingListItem.shoppingListId], references: [shoppingList.id] }),
}));

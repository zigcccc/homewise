import { relations } from 'drizzle-orm';
import { index, integer, jsonb, pgEnum, pgTable, text } from 'drizzle-orm/pg-core';

import { type FieldChange } from '#lib/models';

import { baseDbEntityFields } from './__shared/base';
import { household } from './household';
import { user } from './user';

/**
 * What a logged change was about, and — via `householdEventEntity` — what a realtime event names.
 *
 * Append new values at the **end**: drizzle-kit emits an additive `ALTER TYPE … ADD VALUE` only
 * there, and can drop and recreate the type for one spliced into the middle.
 */
export const householdActivityEntityEnum = pgEnum('householdActivityEntity', [
  'child_dictionary_entry',
  'child_profile',
  'contact',
  'expense',
  'expense_category',
  'household',
  'household_invite',
  'household_member',
  'ingredient',
  'meal_plan',
  'medical_info',
  'pet_profile',
  'recipe',
  'recipe_tag',
  'shopping_list',
  'storage_item',
  'storage_location',
  'store',
]);

export const householdActivityOperationEnum = pgEnum('householdActivityOperation', ['create', 'update', 'delete']);

/**
 * Who changed what, and when. Written from `withHousehold`'s emit buffer once a request succeeds.
 *
 * A row is one *line* of the feed rather than one change — repeated edits fold, so `count` can
 * exceed 1 — and `actorName`/`label` are snapshots, because the row a line describes is routinely
 * gone by the time anyone reads it.
 */
export const householdActivity = pgTable(
  'household_activity',
  {
    ...baseDbEntityFields,
    householdId: integer('household_id')
      .notNull()
      .references(() => household.id, { onDelete: 'cascade' }),
    /** Nulled rather than cascaded when an account goes: the household's history is not the user's to delete. */
    actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),
    actorName: text('actor_name').notNull(),
    entity: householdActivityEntityEnum().notNull(),
    operation: householdActivityOperationEnum().notNull(),
    /** The affected row, for deep-linking. Null when the change named no single row. */
    entityId: integer('entity_id'),
    /** The owning row, for entities that are only reachable through their parent. */
    parentId: integer('parent_id'),
    label: text('label').notNull(),
    /** How many times this line happened; `updatedAt` is when the last of them landed. */
    count: integer('count').notNull().default(1),
    /** What the change touched. Appended to when a run folds, so the feed collapses it for reading. */
    changes: jsonb('changes').$type<FieldChange[]>().notNull().default([]),
  },
  (table) => [
    // `id` is serial, so it orders like `createdAt` and the feed's anchor is just an id.
    index('household_activity_household_idx').on(table.householdId, table.id.desc()),
  ]
);

export const householdActivityRelations = relations(householdActivity, ({ one }) => ({
  household: one(household, { fields: [householdActivity.householdId], references: [household.id] }),
  /** The account that acted, when it still exists — the feed reads `actorName` either way. */
  actor: one(user, { fields: [householdActivity.actorId], references: [user.id] }),
}));

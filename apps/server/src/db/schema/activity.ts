import { relations } from 'drizzle-orm';
import { index, integer, jsonb, pgEnum, pgTable, text } from 'drizzle-orm/pg-core';

import { type FieldChange } from '#lib/models';

import { baseDbEntityFields } from './__shared/base';
import { household } from './household';
import { user } from './user';

/**
 * What a logged change was about. This is also the realtime event union — `householdEventEntity` is
 * derived from it — so the two can never name different things.
 *
 * Append new values at the **end**: drizzle-kit emits a plain additive `ALTER TYPE … ADD VALUE` only
 * for a value appended there, and can drop and recreate the type for one spliced into the middle.
 * The order carries no meaning; the feed sorts by time and filters by equality.
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
 * Who changed what, and when. Written from `withHousehold`'s emit buffer once a request succeeds, so
 * a row exists only for work that actually landed.
 *
 * A row is one *line* of the feed rather than one change: repeated edits to the same thing fold into
 * the line above them, so `count` can be more than 1.
 *
 * `actorName` and `label` are **snapshots**, not joins, and that is the whole point of the table: the
 * row this line describes is routinely gone by the time anyone reads it, and a member who has since
 * left the household still did the thing.
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
    /**
     * How many times this line happened. A burst of edits to one row by one person folds into a
     * single row rather than repeating itself — see `ActivityService.record`. `updatedAt` is when
     * the last of them landed, and is the timestamp the feed reads.
     */
    count: integer('count').notNull().default(1),
    /**
     * Which fields the change touched, and what it changed them between — `FieldChange[]`.
     *
     * Appended to rather than merged when a run folds, so the array holds every edit in order and the
     * feed collapses it for reading (first value out, last value in). Empty for anything that took no
     * diff, which is every create and every delete.
     */
    changes: jsonb('changes').$type<FieldChange[]>().notNull().default([]),
  },
  (table) => [
    // `id` is serial, so it orders identically to `createdAt` and the feed's keyset cursor is just an
    // id. Descending, because every read of this table starts at the newest row.
    index('household_activity_household_idx').on(table.householdId, table.id.desc()),
  ]
);

export const householdActivityRelations = relations(householdActivity, ({ one }) => ({
  household: one(household, { fields: [householdActivity.householdId], references: [household.id] }),
  /** The account that acted, when it still exists — the feed reads `actorName` either way. */
  actor: one(user, { fields: [householdActivity.actorId], references: [user.id] }),
}));

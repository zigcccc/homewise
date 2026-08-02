import { relations, sql } from 'drizzle-orm';
import { check, date, index, integer, pgTable, text, unique } from 'drizzle-orm/pg-core';

import { baseDbEntityFields } from './__shared/base';
import { household, householdMember } from './household';
import { recipe } from './recipe';
import { user } from './user';

/**
 * One thing eaten on one day — in practice lunch, the main midday meal.
 *
 * There is deliberately no "meal plan" parent row: a plan is just the meals that happen to sit on a
 * range of dates. Planning a new week needs no setup step, clearing one leaves nothing behind, and
 * planning three weeks ahead is the same operation as planning one.
 *
 * A meal is labelled either by a recipe (`recipeId`, whose title is read live off the join so a
 * rename shows up on every plan) or by free text (`title`) — never neither, which is what the check
 * enforces. Deleting a recipe nulls the link; `RecipesService.delete` copies its title into `title`
 * first, so the plan keeps a readable label instead of a hole. Without that tombstone the check
 * makes the delete fail, which is the point: it can't be quietly forgotten.
 */
export const plannedMeal = pgTable(
  'planned_meal',
  {
    ...baseDbEntityFields,
    householdId: integer('household_id')
      .notNull()
      .references(() => household.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    /**
     * Order within the day. No unique on `(day, position)` — re-sequencing writes the rows one by
     * one, so a unique there would fight the write pattern and force a deferred constraint without
     * buying anything. Same reasoning as `recipe_step.position`.
     */
    position: integer('position').notNull(),
    recipeId: integer('recipe_id').references(() => recipe.id, { onDelete: 'set null' }),
    /** Free-text label, or the tombstoned recipe title. NULL while a recipe is attached. */
    title: text('title'),
    /** About this meal specifically: "double batch", "use up the leftovers". */
    note: text('note'),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  },
  (table) => [
    // The range read is the only query this table serves.
    index('planned_meal_household_day_idx').on(table.householdId, table.day),
    // Postgres doesn't index FK referencing columns; without this the SET NULL on a recipe delete
    // sequentially scans every planned meal ever made.
    index('planned_meal_recipe_idx').on(table.recipeId),
    check('planned_meal_label_check', sql`${table.recipeId} IS NOT NULL OR ${table.title} IS NOT NULL`),
  ]
);

/**
 * Who a meal is for. An **empty set means everyone**, so the common case costs no rows at all.
 *
 * A meal with members is for exactly those people, which makes "they're having pasta, I'm having
 * soup" and "I'm eating at work" (a free-text meal tagged with one person) the same mechanism rather
 * than two features.
 */
export const plannedMealMember = pgTable(
  'planned_meal_member',
  {
    ...baseDbEntityFields,
    plannedMealId: integer('planned_meal_id')
      .notNull()
      .references(() => plannedMeal.id, { onDelete: 'cascade' }),
    householdMemberId: integer('household_member_id')
      .notNull()
      .references(() => householdMember.id, { onDelete: 'cascade' }),
  },
  (table) => [
    unique('planned_meal_member_unique').on(table.plannedMealId, table.householdMemberId),
    index('planned_meal_member_member_idx').on(table.householdMemberId),
  ]
);

/**
 * A note about a whole day — "picnic for the whole family, 8 adults and 2 children".
 *
 * Not a parent of `planned_meal`, despite covering the same day: a day needs no row to hold meals,
 * and clearing the note deletes this row rather than leaving an empty one behind.
 */
export const plannedDayNote = pgTable(
  'planned_day_note',
  {
    ...baseDbEntityFields,
    householdId: integer('household_id')
      .notNull()
      .references(() => household.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    note: text('note').notNull(),
  },
  (table) => [unique('planned_day_note_household_day_unique').on(table.householdId, table.day)]
);

export const plannedMealRelations = relations(plannedMeal, ({ many, one }) => ({
  /** Who put it on the plan. Survives their account deletion as NULL. */
  creator: one(user, { fields: [plannedMeal.createdBy], references: [user.id] }),
  household: one(household, { fields: [plannedMeal.householdId], references: [household.id] }),
  members: many(plannedMealMember),
  recipe: one(recipe, { fields: [plannedMeal.recipeId], references: [recipe.id] }),
}));

export const plannedMealMemberRelations = relations(plannedMealMember, ({ one }) => ({
  /** The person eating it — named `member`, not `household_member`, since there's no ambiguity here. */
  member: one(householdMember, {
    fields: [plannedMealMember.householdMemberId],
    references: [householdMember.id],
  }),
  plannedMeal: one(plannedMeal, { fields: [plannedMealMember.plannedMealId], references: [plannedMeal.id] }),
}));

export const plannedDayNoteRelations = relations(plannedDayNote, ({ one }) => ({
  household: one(household, { fields: [plannedDayNote.householdId], references: [household.id] }),
}));

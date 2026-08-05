import { relations, sql } from 'drizzle-orm';
import { date, index, integer, numeric, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { baseDbEntityFields } from './__shared/base';
import { currencyEnum } from './__shared/currency';
import { household } from './household';

/**
 * A label a household files its spending under — "Groceries", "Kindergarten", "The dog".
 *
 * Its own table rather than an enum, because the categories worth having are the ones a particular
 * household would think of, and no list written here would be that list. An expense points at one or
 * at nothing at all; uncategorised is the default and stays a legitimate resting state.
 *
 * Names are deduplicated case-insensitively for the same reason shops are — two "Groceries" rows
 * would split one month's spending across two rows of the same breakdown.
 */
export const expenseCategory = pgTable(
  'expense_category',
  {
    ...baseDbEntityFields,
    householdId: integer('household_id')
      .notNull()
      .references(() => household.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
  },
  (table) => [uniqueIndex('expense_category_household_name_unique').on(table.householdId, sql`lower(${table.name})`)]
);

/**
 * One thing the household paid for.
 *
 * There is deliberately no "month" parent row, for the same reason the meal plan has no plan row: a
 * month is just the expenses whose `recordedAt` falls in it. Nothing needs opening, and looking at a
 * month nobody has spent anything in costs no rows.
 *
 * Unlike every other named row in this schema there is **no unique index on the title** — two
 * "Groceries" in a week is the normal case, not a mistake to protect against. That is also why this
 * table's service has no `assertNameAvailable`: there is no constraint for it to front.
 */
export const expense = pgTable(
  'expense',
  {
    ...baseDbEntityFields,
    householdId: integer('household_id')
      .notNull()
      .references(() => household.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    /** NULL is uncategorised — the default. `set null`, so deleting a category never blocks. */
    categoryId: integer('category_id').references(() => expenseCategory.id, { onDelete: 'set null' }),
    /**
     * Major units. `mode: 'number'` for the same reason the recipe quantities use it — drizzle hands
     * back `numeric` as a string otherwise.
     *
     * Floats are safe here only because nothing ever adds these up in JS: the monthly total is a
     * Postgres `sum`, where `numeric` is exact. Keep it that way.
     */
    amount: numeric('amount', { precision: 12, scale: 2, mode: 'number' }).notNull(),
    /**
     * What this was paid in, copied off the household when the row was written rather than read live
     * off the join — changing the household's currency must not silently restate what past months
     * cost.
     */
    currency: currencyEnum().notNull(),
    /** The day the money moved, which is routinely not the day the row was written. */
    recordedAt: date('recorded_at').notNull(),
    /**
     * Set when the purchase was returned. The row stays — it happened, and it is worth seeing — but
     * its amount stops counting toward the month.
     *
     * A timestamp rather than a flag, the same call `shopping_list.completedAt` makes: "when did we
     * take that back" is a question the stamp can answer and a boolean can't, and it costs nothing.
     */
    paidBackAt: timestamp('paid_back_at'),
  },
  (table) => [
    // The month range read is the only query this table serves.
    index('expense_household_recorded_at_idx').on(table.householdId, table.recordedAt),
    // Postgres doesn't index FK referencing columns; without this the SET NULL on a category delete
    // sequentially scans every expense ever logged.
    index('expense_category_idx').on(table.categoryId),
  ]
);

export const expenseCategoryRelations = relations(expenseCategory, ({ many, one }) => ({
  expenses: many(expense),
  household: one(household, { fields: [expenseCategory.householdId], references: [household.id] }),
}));

export const expenseRelations = relations(expense, ({ one }) => ({
  /** What it's filed under. Survives the category's deletion as NULL. */
  category: one(expenseCategory, { fields: [expense.categoryId], references: [expenseCategory.id] }),
  household: one(household, { fields: [expense.householdId], references: [household.id] }),
}));

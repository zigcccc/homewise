import { relations, sql } from 'drizzle-orm';
import { integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';

import { baseDbEntityFields } from './__shared/base';
import { household } from './household';

/**
 * A shop the household buys at — "Spar", "Hofer", the Saturday market. An ingredient points at the
 * one it's usually bought from, and a shopping list uses that to file the ingredient under the
 * right section, so a single trip's worth of items reads together.
 *
 * Its own file rather than sitting beside `ingredient` in `recipe.ts`: both `recipe.ts` and
 * `shopping-list.ts` need to reference it, and this is what keeps that from being a cycle.
 *
 * Names are deduplicated case-insensitively for the same reason ingredients are — two "Spar" rows
 * would split one shop's items across two sections of the same list.
 */
export const store = pgTable(
  'store',
  {
    ...baseDbEntityFields,
    householdId: integer('household_id')
      .notNull()
      .references(() => household.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    notes: text('notes'),
  },
  (table) => [uniqueIndex('store_household_name_unique').on(table.householdId, sql`lower(${table.name})`)]
);

export const storeRelations = relations(store, ({ one }) => ({
  household: one(household, { fields: [store.householdId], references: [household.id] }),
}));

import { pgTable, text, decimal, serial } from 'drizzle-orm/pg-core';

export const expenses = pgTable('expenses', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  amount: decimal('amount').notNull(),
});

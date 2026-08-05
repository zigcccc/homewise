import { createInsertSchema, createUpdateSchema } from 'drizzle-zod';
import z from 'zod';

import * as schema from '#db/schema/core';
import { dbOwnedColumns, searchQueryParam, sortDirection } from '#lib/models';

/** The name bounds on their own, so an inline rename validates against the same contract. */
export const expenseCategoryName = z
  .string()
  .trim()
  .min(1, { error: 'Name must contain at least 1 character' })
  .max(64, { error: 'Name must contain at most 64 characters' });

export const createExpenseCategoryModel = createInsertSchema(schema.expenseCategory, {
  name: () => expenseCategoryName,
}).omit(dbOwnedColumns);
export type CreateExpenseCategory = z.infer<typeof createExpenseCategoryModel>;

export const patchExpenseCategoryModel = createUpdateSchema(schema.expenseCategory, {
  name: () => expenseCategoryName,
}).omit(dbOwnedColumns);
export type PatchExpenseCategory = z.infer<typeof patchExpenseCategoryModel>;

export const expenseCategoryPathParamsModel = z.object({ id: z.coerce.number<number>().int().positive() });

export const expenseCategorySortKey = z.enum(['name', 'createdAt']);
export type ExpenseCategorySortKey = z.infer<typeof expenseCategorySortKey>;

export const listExpenseCategoriesQueryParamsModel = z.object({
  search: searchQueryParam,
  sortKey: expenseCategorySortKey.default('name').catch('name'),
  sortDirection: sortDirection.default('asc').catch('asc'),
});
export type ListExpenseCategoriesQueryParams = z.infer<typeof listExpenseCategoriesQueryParamsModel>;

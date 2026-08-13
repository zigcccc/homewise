import { createInsertSchema, createUpdateSchema } from 'drizzle-zod';
import z from 'zod';

import * as schema from '#db/schema/core';
import { dbOwnedColumns, moneyAmount, pagedQueryParams, searchQueryParam, sortDirection } from '#lib/models';
import { expenseCategoryName } from '#modules/expense-categories/expense-categories.model';

/** The title bounds on their own, so the table's inline editor validates against the same contract. */
export const expenseTitle = z
  .string()
  .trim()
  .min(1, { error: 'Title must contain at least 1 character' })
  .max(120, { error: 'Title must contain at most 120 characters' });

/**
 * A day an expense can sit on. Bounded, because `z.iso.date()` happily accepts `3000-01-01` and an
 * expense lives on a calendar the month switcher can actually reach.
 *
 * Spelled out rather than taken from the column: drizzle-zod renders a `date` column as a bare
 * `z.string()`, which accepts `2026-13-45` and `nope` alike.
 */
const expenseDay = z.iso
  .date({ error: 'Use a valid date' })
  .refine((value) => value >= '2000-01-01' && value <= '2100-12-31', { error: 'Pick a date this century' });

/**
 * A category to file this under **by name**, found-or-created as part of the same write. Not a column
 * — it resolves to `categoryId`, which it takes precedence over, so the picker can offer "create it on
 * the fly" without making the user leave first, and without minting one when they abandon the form.
 */
const categoryName = expenseCategoryName.optional();

/**
 * `currency` is copied off the household by the service, and `paidBackAt` is a stamp the server owns —
 * neither is the client's to send. `paidBack` below is the toggle that drives the latter.
 */
const serverOwnedExpenseColumns = { ...dbOwnedColumns, currency: true, paidBackAt: true } as const;

export const createExpenseModel = createInsertSchema(schema.expense, {
  title: () => expenseTitle,
  amount: () => moneyAmount('Amount'),
  recordedAt: () => expenseDay,
})
  .omit(serverOwnedExpenseColumns)
  // Uncategorised is the resting state, so an expense may arrive without mentioning a category.
  .partial({ categoryId: true })
  .extend({ categoryName });
export type CreateExpense = z.infer<typeof createExpenseModel>;

export const patchExpenseModel = createUpdateSchema(schema.expense, {
  title: () => expenseTitle,
  amount: () => moneyAmount('Amount'),
  recordedAt: () => expenseDay,
})
  .omit(serverOwnedExpenseColumns)
  .extend({
    categoryName,
    /**
     * The paid-back toggle. `true` stamps the moment, `false` clears it — the client never sends a
     * date, the same split `shopping_list_item`'s `checked` makes over its stored `checkedAt`.
     */
    paidBack: z.boolean().optional(),
  });
export type PatchExpense = z.infer<typeof patchExpenseModel>;

export const expensePathParamsModel = z.object({ id: z.coerce.number<number>().int().positive() });

export const expenseSortKey = z.enum(['recordedAt', 'amount', 'title', 'createdAt']);
export type ExpenseSortKey = z.infer<typeof expenseSortKey>;

/** How far one range read may reach. `ExpensesService.list` clamps to it rather than refusing. */
export const MAX_EXPENSE_RANGE_DAYS = 366;

/** The window both reads take. `from`/`to` on the wire; the web keeps `month`/`year` in the URL. */
const expenseRange = {
  from: expenseDay.optional().catch(undefined),
  to: expenseDay.optional().catch(undefined),
};

export const listExpensesQueryParamsModel = z.object({
  ...expenseRange,
  search: searchQueryParam,
  /** A category id, or `none` for the expenses nobody has categorised. */
  category: z
    .union([z.literal('none'), z.coerce.number<number>().int().positive()])
    .optional()
    .catch(undefined),
  sortKey: expenseSortKey.default('recordedAt').catch('recordedAt'),
  sortDirection: sortDirection.default('desc').catch('desc'),
  ...pagedQueryParams.shape,
});
export type ListExpensesQueryParams = z.infer<typeof listExpensesQueryParamsModel>;

/**
 * The summary deliberately takes no `search` and no `category`: it describes the whole window, so the
 * breakdown still lists every category while one of them is selected, and the header total doesn't
 * shift as someone types in the search box.
 */
export const expensesSummaryQueryParamsModel = z.object(expenseRange);
export type ExpensesSummaryQueryParams = z.infer<typeof expensesSummaryQueryParamsModel>;

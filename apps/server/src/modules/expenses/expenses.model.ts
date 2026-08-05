import z from 'zod';

import { moneyAmount } from '#lib/models';
import { expenseCategoryName } from '#modules/expense-categories/expense-categories.model';

const title = (model: z.ZodString) =>
  model
    .trim()
    .min(1, { error: 'Title must contain at least 1 character' })
    .max(120, { error: 'Title must contain at most 120 characters' });

/** The title bounds on their own, so the table's inline editor validates against the same contract. */
export const expenseTitle = title(z.string());

/**
 * A day an expense can sit on. Bounded, because `z.iso.date()` happily accepts `3000-01-01` and an
 * expense lives on a calendar the month switcher can actually reach.
 */
const expenseDay = z.iso
  .date({ error: 'Use a valid date' })
  .refine((value) => value >= '2000-01-01' && value <= '2100-12-31', { error: 'Pick a date this century' });

/** `null` files this as uncategorised; omitting the key leaves the category untouched. */
const categoryId = z.number().int().positive().nullish();

/**
 * A category to file this under **by name**, found-or-created as part of the same write. Takes
 * precedence over `categoryId`, so the picker can offer "create it on the fly" without making the
 * user leave and add the category first — and without minting one when they then abandon the form.
 */
const categoryName = expenseCategoryName.optional();

export const createExpenseModel = z.object({
  title: title(z.string()),
  amount: moneyAmount('Amount'),
  recordedAt: expenseDay,
  categoryId,
  categoryName,
});
export type CreateExpense = z.infer<typeof createExpenseModel>;

export const patchExpenseModel = z.object({
  title: title(z.string()).optional(),
  amount: moneyAmount('Amount').optional(),
  recordedAt: expenseDay.optional(),
  categoryId,
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

export const expenseSortDirection = z.enum(['asc', 'desc']);
export type ExpenseSortDirection = z.infer<typeof expenseSortDirection>;

/** How far one range read may reach. `ExpensesService.list` clamps to it rather than refusing. */
export const MAX_EXPENSE_RANGE_DAYS = 366;

/**
 * The window and the filters. `from`/`to` rather than a month and a year: `recorded_at` is a `date`
 * column, so a range is a direct scan of `expense_household_recorded_at_idx` where an
 * `extract(month from …)` could not use it at all — and which month "today" falls in is a question
 * only the client can answer, since the server's clock is UTC. The web keeps `month`/`year` in the
 * URL and translates, exactly as the meal plan does with its `from`/`weeks`.
 */
const expenseRange = {
  from: expenseDay.optional().catch(undefined),
  to: expenseDay.optional().catch(undefined),
};

export const listExpensesQueryParamsModel = z.object({
  ...expenseRange,
  /** Case-insensitive substring match on the title. */
  search: z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : value))
    .optional()
    .catch(undefined),
  /** A category id, or `none` for the expenses nobody has categorised. */
  category: z
    .union([z.literal('none'), z.coerce.number<number>().int().positive()])
    .optional()
    .catch(undefined),
  sortKey: expenseSortKey.default('recordedAt').catch('recordedAt'),
  sortDirection: expenseSortDirection.default('desc').catch('desc'),
});
export type ListExpensesQueryParams = z.infer<typeof listExpensesQueryParamsModel>;

/**
 * The summary deliberately takes no `search` and no `category`: it describes the whole window, so the
 * breakdown still lists every category while one of them is selected, and the header total doesn't
 * shift as someone types in the search box.
 */
export const expensesSummaryQueryParamsModel = z.object(expenseRange);
export type ExpensesSummaryQueryParams = z.infer<typeof expensesSummaryQueryParamsModel>;

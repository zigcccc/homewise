import z from 'zod';

const name = (model: z.ZodString) =>
  model
    .trim()
    .min(1, { error: 'Name must contain at least 1 character' })
    .max(64, { error: 'Name must contain at most 64 characters' });

/** The name bounds on their own, so an inline rename validates against the same contract. */
export const expenseCategoryName = name(z.string());

export const createExpenseCategoryModel = z.object({ name: name(z.string()) });
export type CreateExpenseCategory = z.infer<typeof createExpenseCategoryModel>;

export const patchExpenseCategoryModel = z.object({ name: name(z.string()).optional() });
export type PatchExpenseCategory = z.infer<typeof patchExpenseCategoryModel>;

export const expenseCategoryPathParamsModel = z.object({ id: z.coerce.number<number>().int().positive() });

export const expenseCategorySortKey = z.enum(['name', 'createdAt']);
export type ExpenseCategorySortKey = z.infer<typeof expenseCategorySortKey>;

export const expenseCategorySortDirection = z.enum(['asc', 'desc']);
export type ExpenseCategorySortDirection = z.infer<typeof expenseCategorySortDirection>;

export const listExpenseCategoriesQueryParamsModel = z.object({
  /** Case-insensitive substring match on the name. */
  search: z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : value))
    .optional()
    .catch(undefined),
  sortKey: expenseCategorySortKey.default('name').catch('name'),
  sortDirection: expenseCategorySortDirection.default('asc').catch('asc'),
});
export type ListExpenseCategoriesQueryParams = z.infer<typeof listExpenseCategoriesQueryParamsModel>;

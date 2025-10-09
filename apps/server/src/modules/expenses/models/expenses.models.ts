import * as z from 'zod';

export const createExpenseModel = z.object({
  name: z.string().trim().min(3, { error: 'Too short' }).max(128, { error: 'Too long' }),
  amount: z.preprocess((val) => (typeof val === 'number' ? val.toFixed(2) : val), z.string()),
});
export type CreateExpense = z.infer<typeof createExpenseModel>;

export const readExpensePathParamsModel = z.object({ id: z.coerce.number<number>() });
export type ReadExpensePathParams = z.infer<typeof readExpensePathParamsModel>;

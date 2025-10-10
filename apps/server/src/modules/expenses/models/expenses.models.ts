import * as z from 'zod';

export const createExpenseModel = z.object({
  name: z.string().trim().min(3, { error: 'Too short' }).max(128, { error: 'Too long' }),
  amount: z
    .number()
    .refine((num) => num !== 0, { error: "Amount can' be 0" })
    .transform((num) => num.toFixed(2)),
});
export type CreateExpense = z.infer<typeof createExpenseModel>;

export const readExpensePathParamsModel = z.object({ id: z.coerce.number<number>() });
export type ReadExpensePathParams = z.infer<typeof readExpensePathParamsModel>;
